"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, formatUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
// Imperative (non-hook) action: `wagmi/actions` re-exports @wagmi/core/actions.
import { waitForTransactionReceipt } from "wagmi/actions";

import { erc20Abi, savingsJarAbi } from "@/config/abi";
import {
  IS_CONTRACT_DEPLOYED,
  SAVINGS_JAR_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/config/contracts";
import { ARC_TESTNET_ID, arcMainnet, wagmiConfig } from "@/config/wagmi";
import { formatContractError } from "@/lib/format";
import {
  EMPTY_JAR,
  type JarData,
  type OwnedJar,
  type JarTier,
  TIER_LABELS,
  type TxState,
  type TxStage,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Transaction state machine                                                 */
/* -------------------------------------------------------------------------- */

const IDLE_TX: TxState = { stage: "idle", message: "", hash: null, error: null };

/** Mirrors `MAX_JARS_PER_WALLET` in SavingsJar.sol. */
export const MAX_JARS_PER_WALLET = 10;

type TxAction =
  | { type: "start"; stage: TxStage; message: string }
  | { type: "hash"; hash: `0x${string}` }
  | { type: "stage"; stage: TxStage; message: string }
  | { type: "fail"; message: string }
  | { type: "reset" };

function txReducer(state: TxState, action: TxAction): TxState {
  switch (action.type) {
    case "start":
      return { stage: action.stage, message: action.message, hash: null, error: null };
    case "hash":
      return { ...state, hash: action.hash };
    case "stage":
      return { ...state, stage: action.stage, message: action.message, error: null };
    case "fail":
      return { ...state, stage: "error", message: "", error: action.message };
    case "reset":
      return IDLE_TX;
    default:
      return state;
  }
}

/** Stages where a wallet prompt or an on-chain confirmation is in flight. */
const BUSY_STAGES: readonly TxStage[] = ["approving", "creating", "toppingUp", "withdrawing", "breaking"];
const DONE_STAGES: readonly TxStage[] = ["approved", "created", "toppedUp", "withdrawn", "broken"];

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

export interface CreateJarInput {
  /** Human readable amount, e.g. "150" or "150.25". */
  amount: string;
  /** Lock length in seconds. Must be within [1 day, 365 days]. */
  durationSeconds: number;
  /** Label stored on-chain. */
  name: string;
  /**
   * Optional piggy-savings goal, e.g. "5000". When set (and >= `amount`) the
   * jar is created via `createGoalJar`: it can then be topped up bit by bit
   * with `addToJar` and withdrawn early once the balance reaches the target.
   * Omit (or empty string) for a classic jar.
   */
  targetAmount?: string;
}

export interface UseSavingsJarResult {
  // --- wallet / network -----------------------------------------------------
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | undefined;
  /** Wallet is connected but pointed at a chain the app does not support. */
  isWrongNetwork: boolean;
  switchToArc: () => void;
  isSwitchingChain: boolean;

  // --- jars -----------------------------------------------------------------
  /** Every active jar of the connected wallet, lowest slot id first. */
  jars: OwnedJar[];
  /** Slot id of the jar on screen, or null while the "new jar" form is shown. */
  selectedJarId: number | null;
  /** Show jar `id`, or pass null to open the "new jar" form. */
  selectJar: (id: number | null) => void;
  /** Contract limit on simultaneously active jars per wallet. */
  maxJars: number;
  /** True while the wallet still has a free jar slot. */
  canCreateMore: boolean;
  /** Sum of every active deposit, raw USDC units. */
  totalLocked: bigint;

  // --- incentives (Incentives 1-3, see SavingsJar.sol) -----------------------
  /** This wallet's non-transferable lifetime points ("USDC-days" held to maturity). */
  points: bigint;
  /** `points` turned into a badge: Bronze / Silver / Gold / Platinum. */
  tier: JarTier;
  /** USDC still available in the time-bonus pool (Incentive 2). */
  bonusPoolBalance: bigint;
  bonusPoolBalanceFormatted: string;
  /** Current annual bonus rate, in basis points (500 = 5%/year). */
  bonusAprBps: bigint;
  /** Sum of `pendingReward` across every active jar (what breaking-early has funded so far, still unclaimed). */
  totalPendingRewards: bigint;

  // --- selected jar -----------------------------------------------------------
  // Everything below describes the jar that is currently selected. With no jar
  // selected (new-jar form) it is the empty jar and `isJarActive` is false.
  jarData: JarData;
  /** Seconds left according to the chain. 0 when inactive or already matured. */
  timeRemaining: number;
  isJarActive: boolean;
  isJarUnlocked: boolean;
  isJarLoading: boolean;
  isJarError: boolean;
  jarError: string | null;
  /** This jar's exact share of the reward pool right now (Incentive 1). 0 until it grows. */
  jarPendingReward: bigint;
  /** This jar's time-weighted bonus if withdrawn right now (Incentive 2), already capped at the pool balance. */
  jarPreviewBonus: bigint;
  /** Piggy-savings goal of the selected jar. `0n` = classic jar (no goal). */
  jarTargetAmount: bigint;
  /** True once the selected goal jar's balance has reached its target. */
  isJarGoalReached: boolean;
  /** 0-100 share of the selected jar's goal already saved (0 for classic jars). */
  jarGoalProgressPercent: number;
  /** USDC still needed for the selected jar to hit its goal (0n when none/reached). */
  jarRemainingToGoal: bigint;
  /** Unix seconds at which the selected jar was created (0 when none). */
  createdAt: number;
  /** Total seconds this jar is locked for (unlockTime - createdAt). */
  lockDurationSeconds: number;
  /** Seconds already served. */
  elapsedSeconds: number;
  /** 0-100 share of the lock period served - drives the jar fill level. */
  progressPercent: number;

  // --- token ----------------------------------------------------------------
  /** Raw USDC units (6 decimals). */
  usdcBalance: bigint;
  usdcBalanceFormatted: string;
  isBalanceLoading: boolean;
  /**
   * Raw allowance already granted to SavingsJar. Compare it with the amount you
   * are about to deposit: `allowance >= amount` means the approve step can be
   * skipped entirely.
   */
  allowance: bigint;
  /** Native balance - on Arc this is USDC and it pays for gas. */
  gasBalanceFormatted: string;

  // --- protocol stats (transparency) ----------------------------------------
  /** USDC discipline fees currently sitting in the contract. */
  penalties: bigint;
  penaltiesFormatted: string;
  totalJarsCreated: bigint;
  totalWithdrawn: bigint;
  totalBrokenReturned: bigint;

  // --- writes ---------------------------------------------------------------
  createJar: (input: CreateJarInput) => Promise<boolean>;
  /**
   * Piggy savings: top up the selected jar with more USDC while it is locked.
   * Goal jars refuse top-ups that would overshoot their target. Requires a
   * matching ERC-20 approval first (same two-step flow as `createJar`).
   */
  addToJar: (amountText: string) => Promise<boolean>;
  /** Withdraw the selected jar (matured, or a goal jar that reached its target). */
  withdrawJar: () => Promise<boolean>;
  /** Break the selected jar early (10% discipline fee). */
  breakJar: () => Promise<boolean>;
  approveUSDC: (amount: bigint) => Promise<boolean>;
  /** Top up the time-bonus pool (Incentive 2). Anyone can call this. Approve USDC to the jar contract first. */
  fundBonusPool: (amountText: string) => Promise<boolean>;

  // --- tx status ------------------------------------------------------------
  tx: TxState;
  txHash: `0x${string}` | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  receiptStatus: "pending" | "success" | "failed" | null;
  resetTx: () => void;

  // --- plumbing -------------------------------------------------------------
  /** Set by the /demo route: suppresses network banners and intercepts writes. */
  demoMode?: boolean;
  /** False while the address is still the zero placeholder -> deploy banner. */
  isContractDeployed: boolean;
  contractAddress: `0x${string}`;
  /** Live `owner()` from the contract. Undefined until it loads. */
  contractOwner: `0x${string}` | undefined;
  /** True once `contractOwner` has loaded and matches the connected wallet. */
  isOwner: boolean;
  /** Force-refresh every read (jar, balances, allowance, stats). */
  refetchAll: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Human readable USDC -> raw units (6 decimals). Throws on malformed input. */
export function parseUsdc(value: string): bigint {
  const cleaned = value.trim().replace(/,/g, "");
  if (cleaned.length === 0) throw new Error("Enter an amount");
  if (!/^\d*\.?\d*$/.test(cleaned)) throw new Error("Amount must be a number");
  const [, fraction = ""] = cleaned.split(".");
  if (fraction.length > USDC_DECIMALS) {
    throw new Error(`USDC supports a maximum of ${USDC_DECIMALS} decimal places`);
  }
  return parseUnits(cleaned as `${number}`, USDC_DECIMALS);
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `hooks/useSavingsJar.ts`
 * ---------------------------------------------------------------------------
 * The one place that talks to SavingsJar.sol and to USDC. Everything the UI
 * needs - jar state, balances, allowance, the approve / create / withdraw /
 * break flows and their loading-error-success states - comes out of here.
 */
export function useSavingsJar(): UseSavingsJarResult {
  const queryClient = useQueryClient();
  const [tx, dispatch] = useReducer(txReducer, IDLE_TX);

  const { address, isConnected, isConnecting, chainId, status: accountStatus } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const jarAddress = SAVINGS_JAR_ADDRESS;
  /** Reads only make sense once a real contract address is configured. */
  const canRead = isConnected && Boolean(address) && IS_CONTRACT_DEPLOYED;
  const readEnabled = canRead && Boolean(address);

  /* ========================================================================= */
  /*  Reads                                                                     */
  /* ========================================================================= */

  /** One call returns every jar slot of the wallet (at most 10 entries). */
  const jarsQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "getJars",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 4_000 },
  });
  const refetchJars = jarsQuery.refetch;

  const penaltiesQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "getAccumulatedPenalties",
    chainId,
    query: { enabled: canRead, refetchInterval: 20_000 },
  });

  const totalJarsQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "totalJarsCreated",
    chainId,
    query: { enabled: canRead, refetchInterval: 20_000 },
  });

  const totalWithdrawnQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "totalWithdrawn",
    chainId,
    query: { enabled: canRead, refetchInterval: 20_000 },
  });

  const totalBrokenQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "totalBrokenReturned",
    chainId,
    query: { enabled: canRead, refetchInterval: 20_000 },
  });

  const balanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 8_000 },
  });

  const allowanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, jarAddress] : undefined,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 8_000 },
  });

  const nativeQuery = useBalance({
    address,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  });

  /**
   * Contract-wide incentive state (Incentives 1 and 2 - see SavingsJar.sol).
   * `pendingReward` / `previewBonus` are then computed per jar below, in JS,
   * using the exact same formula as the contract - that avoids one extra
   * read per jar (which would need a dynamic-length call list) while still
   * matching on-chain results exactly, since both sides do plain integer
   * (BigInt) math with the same truncation rules.
   */
  const accRewardPerShareQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "accRewardPerShare",
    chainId,
    query: { enabled: canRead, refetchInterval: 8_000 },
  });
  const bonusAprBpsQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "bonusAprBps",
    chainId,
    query: { enabled: canRead, refetchInterval: 15_000 },
  });
  const bonusPoolBalanceQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "bonusPoolBalance",
    chainId,
    query: { enabled: canRead, refetchInterval: 8_000 },
  });

  /** Incentive 3: this wallet's lifetime points and tier. */
  const pointsQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "points",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 8_000 },
  });
  const tierQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "getTier",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: readEnabled, refetchInterval: 8_000 },
  });

  /**
   * Live contract owner. Only used to gate owner-only UI (e.g. hiding the
   * "fund bonus pool" form from regular visitors) - the contract itself
   * doesn't restrict `fundBonusPool` to the owner, this is a UI-level choice.
   * `canRead` (not `readEnabled`) because this doesn't depend on the wallet
   * being connected - it's a property of the contract, not the visitor.
   */
  const ownerQuery = useReadContract({
    address: jarAddress,
    abi: savingsJarAbi,
    functionName: "owner",
    chainId,
    query: { enabled: canRead, refetchInterval: 30_000 },
  });

  /* ========================================================================= */
  /*  Derived jar state                                                         */
  /* ========================================================================= */

  /**
   * Recomputed whenever the chain data refreshes: `jarsUpdatedAt` is a genuine
   * dependency because every poll re-evaluates `now`.
   */
  const jarsUpdatedAt = jarsQuery.dataUpdatedAt;
  const accRewardPerShare = accRewardPerShareQuery.data ?? 0n;
  const bonusAprBps = bonusAprBpsQuery.data ?? 0n;
  const bonusPoolBalance = bonusPoolBalanceQuery.data ?? 0n;

  /** Mirrors the contract's constants exactly - see SavingsJar.sol. */
  const ACC_PRECISION = 10n ** 18n;
  const BPS_DENOMINATOR = 10_000n;
  const SECONDS_PER_YEAR = 31_536_000n;

  const ownedJars = useMemo<OwnedJar[]>(() => {
    void jarsUpdatedAt;
    const now = Math.floor(Date.now() / 1_000);
    const nowBig = BigInt(now);
    const slots = jarsQuery.data ?? [];
    const active: OwnedJar[] = [];
    slots.forEach((slot, index) => {
      if (!slot.isActive || slot.amount === 0n) return;
      const unlockTime = Number(slot.unlockTime);

      // Incentive 1: this jar's exact share of the reward pool, same formula as
      // SavingsJar.pendingReward(). Grows only when someone else breaks a jar.
      const accrued = (slot.amount * accRewardPerShare) / ACC_PRECISION;
      const pendingReward = accrued > slot.rewardDebt ? accrued - slot.rewardDebt : 0n;

      // Incentive 2: simple-interest time bonus, same formula as
      // SavingsJar.previewBonus(), capped at whatever the bonus pool still holds.
      // With piggy-savings top-ups each deposit only earns from the moment it
      // landed: bonus banked by earlier segments + interest on the current
      // balance since the newest deposit (`lastFundedAt`).
      const segmentSeconds = nowBig > slot.lastFundedAt ? nowBig - slot.lastFundedAt : 0n;
      const rawBonus =
        slot.bonusAccrued +
        (slot.amount * bonusAprBps * segmentSeconds) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
      const previewBonus = rawBonus > bonusPoolBalance ? bonusPoolBalance : rawBonus;

      // Piggy savings: goal progress (0 for classic jars, which have target 0).
      const hasGoal = slot.targetAmount > 0n;
      const isGoalReached = hasGoal && slot.amount >= slot.targetAmount;
      const goalProgressPercent = hasGoal
        ? Math.min(100, Number((slot.amount * 10_000n) / slot.targetAmount) / 100)
        : 0;
      const remainingToGoal = hasGoal && slot.amount < slot.targetAmount
        ? slot.targetAmount - slot.amount
        : 0n;

      active.push({
        id: index,
        data: {
          amount: slot.amount,
          unlockTime: slot.unlockTime,
          createdAt: slot.createdAt,
          rewardDebt: slot.rewardDebt,
          targetAmount: slot.targetAmount,
          bonusAccrued: slot.bonusAccrued,
          pointsAccrued: slot.pointsAccrued,
          lastFundedAt: slot.lastFundedAt,
          isActive: slot.isActive,
          jarName: slot.jarName,
        },
        unlockTime,
        createdAt: Number(slot.createdAt),
        timeRemaining: Math.max(0, unlockTime - now),
        isUnlocked: unlockTime <= now,
        pendingReward,
        previewBonus,
        isGoalReached,
        goalProgressPercent,
        remainingToGoal,
      });
    });
    return active;
  }, [jarsQuery.data, jarsUpdatedAt, accRewardPerShare, bonusAprBps, bonusPoolBalance]);

  /**
   * Which jar is on screen. `undefined` = nothing chosen yet (show the first
   * jar, or the create form for a wallet with no jars); "new" = the user asked
   * for the create form; a number = a specific jar slot. A number that no longer
   * matches an active jar (broken / withdrawn) falls back to the first jar.
   */
  const [selection, setSelection] = useState<number | "new" | undefined>(undefined);

  const selectedJar = useMemo<OwnedJar | null>(() => {
    if (selection === "new") return null;
    if (typeof selection === "number") {
      const match = ownedJars.find((entry) => entry.id === selection);
      if (match) return match;
    }
    return ownedJars[0] ?? null;
  }, [selection, ownedJars]);

  const selectedJarId = selectedJar ? selectedJar.id : null;

  const totalLocked = useMemo(
    () => ownedJars.reduce<bigint>((sum, entry) => sum + entry.data.amount, 0n),
    [ownedJars],
  );

  /** Sum of every active jar's `pendingReward` (Incentive 1) - unclaimed so far. */
  const totalPendingRewards = useMemo(
    () => ownedJars.reduce<bigint>((sum, entry) => sum + entry.pendingReward, 0n),
    [ownedJars],
  );

  // Earliest unlock among the jars that are still locked (0 = none pending).
  const nextUnlockSeconds = useMemo(() => {
    const pending = ownedJars.filter((entry) => !entry.isUnlocked).map((entry) => entry.unlockTime);
    return pending.length > 0 ? Math.min(...pending) : 0;
  }, [ownedJars]);

  // The selected jar, expressed with the single-jar field names the UI already uses.
  const jarData: JarData = selectedJar ? selectedJar.data : EMPTY_JAR;
  const isJarActive = selectedJar !== null;
  const timeRemaining = selectedJar ? selectedJar.timeRemaining : 0;
  const isJarUnlocked = selectedJar ? selectedJar.isUnlocked : false;
  const createdAt = selectedJar ? selectedJar.createdAt : 0;
  const unlockTimeSeconds = selectedJar ? selectedJar.unlockTime : 0;
  const jarPendingReward = selectedJar ? selectedJar.pendingReward : 0n;
  const jarPreviewBonus = selectedJar ? selectedJar.previewBonus : 0n;
  const jarTargetAmount = selectedJar ? selectedJar.data.targetAmount : 0n;
  const isJarGoalReached = selectedJar ? selectedJar.isGoalReached : false;
  const jarGoalProgressPercent = selectedJar ? selectedJar.goalProgressPercent : 0;
  const jarRemainingToGoal = selectedJar ? selectedJar.remainingToGoal : 0n;

  // `createdAt` is stored on-chain with each jar, so the exact lock length
  // survives a cold page load (needed for "time elapsed %").
  const lockDurationSeconds =
    isJarActive && createdAt > 0 && unlockTimeSeconds > createdAt
      ? unlockTimeSeconds - createdAt
      : 0;

  const elapsedSeconds = Math.max(0, lockDurationSeconds - timeRemaining);
  const progressPercent =
    lockDurationSeconds > 0
      ? Math.min(100, Math.max(0, (elapsedSeconds / lockDurationSeconds) * 100))
      : isJarUnlocked
        ? 100
        : 0;

  /* ========================================================================= */
  /*  Derived token state                                                       */
  /* ========================================================================= */

  const usdcBalance = balanceQuery.data ?? 0n;
  const allowance = allowanceQuery.data ?? 0n;
  const penalties = penaltiesQuery.data ?? 0n;

  /* ========================================================================= */
  /*  Receipt watcher                                                           */
  /* ========================================================================= */

  const receiptQuery = useWaitForTransactionReceipt({
    hash: tx.hash ?? undefined,
    chainId,
  });

  const isConfirming = Boolean(tx.hash) && receiptQuery.isFetching && !receiptQuery.isSuccess;
  const isConfirmed = receiptQuery.isSuccess;
  const receiptStatus: "pending" | "success" | "failed" | null = receiptQuery.data
    ? receiptQuery.data.status === "success"
      ? "success"
      : "failed"
    : tx.hash
      ? "pending"
      : null;

  /* ========================================================================= */
  /*  Refetch                                                                   */
  /* ========================================================================= */

  const refetchAll = useCallback(() => {
    console.log("[useSavingsJar] refetchAll() - refreshing every read");
    void queryClient.invalidateQueries();
    void refetchJars();
    void balanceQuery.refetch();
    void allowanceQuery.refetch();
    void penaltiesQuery.refetch();
    void totalJarsQuery.refetch();
    void totalWithdrawnQuery.refetch();
    void totalBrokenQuery.refetch();
    void nativeQuery.refetch();
    void accRewardPerShareQuery.refetch();
    void bonusPoolBalanceQuery.refetch();
    void pointsQuery.refetch();
    void tierQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, address, chainId]);

  /* ========================================================================= */
  /*  Write runner                                                              */
  /* ========================================================================= */

  /**
   * Send a transaction, wait for its receipt, and normalise every failure into
   * the shared `tx` state machine.
   *
   * Each caller passes a fully-typed `writeContractAsync(...)` promise, so
   * viem keeps checking function names and argument shapes at the call site -
   * no `any`, no `as` casts anywhere in the write path.
   *
   * @returns `true` only when the transaction was mined successfully.
   */
  const submitTx = useCallback(
    async (
      send: () => Promise<`0x${string}`>,
      label: string,
    ): Promise<boolean> => {
      try {
        const hash = await send();
        dispatch({ type: "hash", hash });
        console.log(`[useSavingsJar] ${label} tx sent:`, hash);

        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId });
        console.log(`[useSavingsJar] ${label} receipt:`, receipt.status);

        if (receipt.status !== "success") {
          dispatch({ type: "fail", message: "Transaction reverted on-chain." });
          return false;
        }
        return true;
      } catch (error) {
        console.error(`[useSavingsJar] ${label} failed:`, error);
        dispatch({ type: "fail", message: formatContractError(error) });
        return false;
      }
    },
    [chainId],
  );

  /* ========================================================================= */
  /*  Writes                                                                    */
  /* ========================================================================= */

  const approveUSDC = useCallback(
    async (amount: bigint): Promise<boolean> => {
      if (!address) {
        dispatch({ type: "fail", message: "Connect your wallet first." });
        return false;
      }
      dispatch({ type: "start", stage: "approving", message: "Approving..." });

      console.log("[useSavingsJar] approveUSDC ->", { spender: jarAddress, amount: amount.toString() });
      const ok = await submitTx(
        () =>
          writeContractAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [jarAddress, amount],
            chainId,
          }),
        "approveUSDC",
      );
      if (!ok) return false;

      dispatch({ type: "stage", stage: "approved", message: "Approved ✓" });
      console.log(`[useSavingsJar] approved ${formatUnits(amount, USDC_DECIMALS)} USDC for`, jarAddress);
      void allowanceQuery.refetch();
      return true;
    },
    [address, jarAddress, submitTx, writeContractAsync, chainId, allowanceQuery],
  );

  /**
   * Top up the time-bonus pool (Incentive 2). Anyone can call this - the
   * caller still needs to `approveUSDC` first, exactly like `createJar`.
   */
  const fundBonusPool = useCallback(
    async (amountText: string): Promise<boolean> => {
      if (!address) {
        dispatch({ type: "fail", message: "Connect your wallet first." });
        return false;
      }

      let rawAmount: bigint;
      try {
        rawAmount = parseUsdc(amountText);
      } catch (error) {
        dispatch({ type: "fail", message: error instanceof Error ? error.message : "Invalid amount" });
        return false;
      }
      if (rawAmount === 0n) {
        dispatch({ type: "fail", message: "Enter an amount greater than 0." });
        return false;
      }

      dispatch({ type: "start", stage: "funding", message: "Funding bonus pool..." });

      console.log("[useSavingsJar] fundBonusPool ->", { amount: rawAmount.toString() });
      const ok = await submitTx(
        () =>
          writeContractAsync({
            address: jarAddress,
            abi: savingsJarAbi,
            functionName: "fundBonusPool",
            args: [rawAmount],
            chainId,
          }),
        "fundBonusPool",
      );
      if (!ok) return false;

      dispatch({ type: "stage", stage: "funded", message: "Bonus pool funded ✓" });
      console.log(`[useSavingsJar] added ${formatUnits(rawAmount, USDC_DECIMALS)} USDC to the bonus pool`);
      refetchAll();
      return true;
    },
    [address, jarAddress, submitTx, writeContractAsync, chainId, refetchAll],
  );

  const createJar = useCallback(
    async (input: CreateJarInput): Promise<boolean> => {
      if (!address) {
        dispatch({ type: "fail", message: "Connect your wallet first." });
        return false;
      }

      let rawAmount: bigint;
      try {
        rawAmount = parseUsdc(input.amount);
      } catch (error) {
        dispatch({ type: "fail", message: error instanceof Error ? error.message : "Invalid amount" });
        return false;
      }
      if (rawAmount === 0n) {
        dispatch({ type: "fail", message: "Amount must be greater than 0" });
        return false;
      }

      dispatch({ type: "start", stage: "creating", message: "Creating Jar..." });

      const duration = BigInt(Math.floor(input.durationSeconds));

      // Piggy savings: with a goal the jar is created via `createGoalJar` so it
      // can be topped up bit by bit and cashed out once the target is reached.
      const hasGoal =
        typeof input.targetAmount === "string" && input.targetAmount.trim().length > 0;
      let rawTarget = 0n;
      if (hasGoal) {
        try {
          rawTarget = parseUsdc(input.targetAmount as string);
        } catch (error) {
          dispatch({
            type: "fail",
            message: error instanceof Error ? error.message : "Invalid goal amount",
          });
          return false;
        }
        if (rawTarget < rawAmount) {
          dispatch({ type: "fail", message: "The savings goal must be at least the deposit amount." });
          return false;
        }
      }

      console.log("[useSavingsJar] createJar ->", {
        amount: rawAmount.toString(),
        duration: duration.toString(),
        name: input.name,
        target: hasGoal ? rawTarget.toString() : "(classic jar)",
      });
      const ok = await submitTx(
        () =>
          hasGoal
            ? writeContractAsync({
                address: jarAddress,
                abi: savingsJarAbi,
                functionName: "createGoalJar",
                args: [rawAmount, duration, input.name, rawTarget],
                chainId,
              })
            : writeContractAsync({
                address: jarAddress,
                abi: savingsJarAbi,
                functionName: "createJar",
                args: [rawAmount, duration, input.name],
                chainId,
              }),
        "createJar",
      );
      if (!ok) return false;

      dispatch({ type: "stage", stage: "created", message: "Jar Created! ✓" });
      console.log("[useSavingsJar] jar created", {
        amount: formatUnits(rawAmount, USDC_DECIMALS),
        durationSeconds: input.durationSeconds,
        name: input.name,
        target: hasGoal ? formatUnits(rawTarget, USDC_DECIMALS) : null,
      });
      refetchAll();

      // Jump to the jar that was just created: the active slot with the newest
      // `createdAt` (the contract may have reused a lower, previously closed slot).
      const refreshed = await refetchJars();
      let newestId = -1;
      let newestCreatedAt = 0n;
      (refreshed.data ?? []).forEach((slot, index) => {
        if (slot.isActive && slot.createdAt >= newestCreatedAt) {
          newestCreatedAt = slot.createdAt;
          newestId = index;
        }
      });
      if (newestId >= 0) setSelection(newestId);
      return true;
    },
    [address, jarAddress, submitTx, writeContractAsync, chainId, refetchAll, refetchJars],
  );

  /**
   * Piggy savings: top up the selected jar with more USDC while it is locked.
   * Same two-step flow as `createJar` - the UI checks the allowance first and
   * sends an approval when needed; the contract itself reverts top-ups that
   * would overshoot a jar's goal or land after maturity.
   */
  const addToJar = useCallback(
    async (amountText: string): Promise<boolean> => {
      if (!address) {
        dispatch({ type: "fail", message: "Connect your wallet first." });
        return false;
      }
      if (selectedJarId === null) {
        dispatch({ type: "fail", message: "Select a jar first." });
        return false;
      }

      let rawAmount: bigint;
      try {
        rawAmount = parseUsdc(amountText);
      } catch (error) {
        dispatch({ type: "fail", message: error instanceof Error ? error.message : "Invalid amount" });
        return false;
      }
      if (rawAmount === 0n) {
        dispatch({ type: "fail", message: "Amount must be greater than 0" });
        return false;
      }

      const jarId = BigInt(selectedJarId);
      dispatch({ type: "start", stage: "toppingUp", message: "Adding USDC..." });

      console.log("[useSavingsJar] addToJar ->", { jarId: jarId.toString(), amount: rawAmount.toString() });
      const ok = await submitTx(
        () =>
          writeContractAsync({
            address: jarAddress,
            abi: savingsJarAbi,
            functionName: "addToJar",
            args: [jarId, rawAmount],
            chainId,
          }),
        "addToJar",
      );
      if (!ok) return false;

      dispatch({ type: "stage", stage: "toppedUp", message: "USDC added ✓" });
      console.log(`[useSavingsJar] added ${formatUnits(rawAmount, USDC_DECIMALS)} USDC to jar ${selectedJarId}`);
      refetchAll();
      return true;
    },
    [address, jarAddress, selectedJarId, submitTx, writeContractAsync, chainId, refetchAll],
  );

  const withdrawJar = useCallback(async (): Promise<boolean> => {
    if (!address) {
      dispatch({ type: "fail", message: "Connect your wallet first." });
      return false;
    }
    if (selectedJarId === null) {
      dispatch({ type: "fail", message: "Select a jar first." });
      return false;
    }
    const jarId = BigInt(selectedJarId);

    dispatch({ type: "start", stage: "withdrawing", message: "Withdrawing..." });

    console.log("[useSavingsJar] withdrawJar ->", { jarId: jarId.toString() });
    const ok = await submitTx(
      () =>
        writeContractAsync({
          address: jarAddress,
          abi: savingsJarAbi,
          functionName: "withdrawJar",
          args: [jarId],
          chainId,
        }),
      "withdrawJar",
    );
    if (!ok) return false;

    dispatch({ type: "stage", stage: "withdrawn", message: "Withdrawn ✓" });
    console.log("[useSavingsJar] jar withdrawn in full");
    refetchAll();
    return true;
  }, [address, jarAddress, selectedJarId, submitTx, writeContractAsync, chainId, refetchAll]);

  const breakJar = useCallback(async (): Promise<boolean> => {
    if (!address) {
      dispatch({ type: "fail", message: "Connect your wallet first." });
      return false;
    }
    if (selectedJarId === null) {
      dispatch({ type: "fail", message: "Select a jar first." });
      return false;
    }
    const jarId = BigInt(selectedJarId);

    dispatch({ type: "start", stage: "breaking", message: "Breaking jar..." });

    console.log("[useSavingsJar] breakJar ->", { jarId: jarId.toString() });
    const ok = await submitTx(
      () =>
        writeContractAsync({
          address: jarAddress,
          abi: savingsJarAbi,
          functionName: "breakJar",
          args: [jarId],
          chainId,
        }),
      "breakJar",
    );
    if (!ok) return false;

    dispatch({ type: "stage", stage: "broken", message: "Jar broken" });
    console.log("[useSavingsJar] jar broken - 10% discipline fee retained by the contract");
    refetchAll();
    return true;
  }, [address, jarAddress, selectedJarId, submitTx, writeContractAsync, chainId, refetchAll]);

  const resetTx = useCallback(() => dispatch({ type: "reset" }), []);

  /** Switch between the wallet's jars, or (null) open the "new jar" form. */
  const selectJar = useCallback((id: number | null) => {
    setSelection(id === null ? "new" : id);
    // A different jar means the previous status line no longer applies.
    dispatch({ type: "reset" });
  }, []);

  /* ========================================================================= */
  /*  Effects                                                                   */
  /* ========================================================================= */

  /**
   * The moment the next lock expires, refresh once so a locked jar flips to
   * "matured" without the user reloading the page.
   */
  useEffect(() => {
    if (nextUnlockSeconds <= 0) return;
    const msUntilUnlock = nextUnlockSeconds * 1_000 - Date.now();
    if (msUntilUnlock <= 0 || msUntilUnlock > 2 ** 31 - 1) return;

    console.log(`[useSavingsJar] unlock refresh scheduled in ${Math.round(msUntilUnlock)}ms`);
    const id = window.setTimeout(() => refetchAll(), msUntilUnlock + 1_500);
    return () => window.clearTimeout(id);
  }, [nextUnlockSeconds, refetchAll]);

  /** A different wallet or chain means the previous status line is stale. */
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [address, chainId]);

  /* ========================================================================= */
  /*  Network                                                                   */
  /* ========================================================================= */

  const isWrongNetwork =
    isConnected && Boolean(chainId) && chainId !== arcMainnet.id && chainId !== ARC_TESTNET_ID;

  const switchToArc = useCallback(() => {
    console.log("[useSavingsJar] switching wallet to Arc Mainnet (5042)");
    switchChain({ chainId: arcMainnet.id });
  }, [switchChain]);

  /* ========================================================================= */
  /*  Result                                                                    */
  /* ========================================================================= */

  const readError = jarsQuery.error ?? balanceQuery.error ?? allowanceQuery.error ?? null;

  return {
    address,
    isConnected,
    isConnecting: isConnecting || accountStatus === "reconnecting",
    chainId,
    isWrongNetwork,
    switchToArc,
    isSwitchingChain,

    jars: ownedJars,
    selectedJarId,
    selectJar,
    maxJars: MAX_JARS_PER_WALLET,
    canCreateMore: ownedJars.length < MAX_JARS_PER_WALLET,
    totalLocked,

    points: pointsQuery.data ?? 0n,
    tier: TIER_LABELS[tierQuery.data ?? 0] ?? "Bronze",
    bonusPoolBalance,
    bonusPoolBalanceFormatted: formatUnits(bonusPoolBalance, USDC_DECIMALS),
    bonusAprBps,
    totalPendingRewards,

    jarData,
    timeRemaining,
    isJarActive,
    isJarUnlocked,
    isJarLoading: jarsQuery.isLoading,
    isJarError: Boolean(jarsQuery.error),
    jarError: readError ? formatContractError(readError) : null,
    jarPendingReward,
    jarPreviewBonus,
    jarTargetAmount,
    isJarGoalReached,
    jarGoalProgressPercent,
    jarRemainingToGoal,
    createdAt,
    lockDurationSeconds,
    elapsedSeconds,
    progressPercent,

    usdcBalance,
    usdcBalanceFormatted: formatUnits(usdcBalance, USDC_DECIMALS),
    isBalanceLoading: balanceQuery.isLoading,
    allowance,
    gasBalanceFormatted: nativeQuery.data
      ? formatUnits(nativeQuery.data.value, nativeQuery.data.decimals)
      : "0",

    penalties,
    penaltiesFormatted: formatUnits(penalties, USDC_DECIMALS),
    totalJarsCreated: totalJarsQuery.data ?? 0n,
    totalWithdrawn: totalWithdrawnQuery.data ?? 0n,
    totalBrokenReturned: totalBrokenQuery.data ?? 0n,

    createJar,
    addToJar,
    withdrawJar,
    breakJar,
    approveUSDC,
    fundBonusPool,

    tx,
    txHash: tx.hash,
    isLoading: BUSY_STAGES.includes(tx.stage),
    isError: tx.stage === "error",
    isSuccess: DONE_STAGES.includes(tx.stage),
    isConfirming,
    isConfirmed,
    receiptStatus,
    resetTx,

    demoMode: false,
    isContractDeployed: IS_CONTRACT_DEPLOYED,
    contractAddress: jarAddress,
    contractOwner: ownerQuery.data,
    isOwner: Boolean(address && ownerQuery.data && address.toLowerCase() === ownerQuery.data.toLowerCase()),
    refetchAll,
  };
}

export default useSavingsJar;
