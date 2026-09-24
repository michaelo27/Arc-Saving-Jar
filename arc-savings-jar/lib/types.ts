import { savingsJarAbi } from "../config/abi/savingsJar.abi";

/**
 * Mirror of the on-chain `JarData` struct returned by `SavingsJar.getJars()`.
 *
 * viem infers exactly this shape from the ABI:
 *   { amount, unlockTime, createdAt, rewardDebt: bigint; isActive: boolean; jarName: string }
 * so assigning `useReadContract(...).data` entries to this type is loss-less
 * and needs no casts and no `any`.
 */
export interface JarData {
  /** Deposited USDC in raw units (6 decimals). */
  amount: bigint;
  /** Unix timestamp, in seconds, at which the jar unlocks. */
  unlockTime: bigint;
  /** Unix timestamp, in seconds, at which the jar was created. */
  createdAt: bigint;
  /** Reward-accumulator baseline at creation. Internal bookkeeping - the UI
   *  never needs this directly; use the contract's `pendingReward()` instead. */
  rewardDebt: bigint;
  /** Whether this slot currently holds an active jar. */
  isActive: boolean;
  /** User supplied label. Empty string when no jar exists. */
  jarName: string;
}

/** Neutral value used before data has loaded (or when no jar exists). */
export const EMPTY_JAR: JarData = {
  amount: 0n,
  unlockTime: 0n,
  createdAt: 0n,
  rewardDebt: 0n,
  isActive: false,
  jarName: "",
};

/**
 * One active jar of the connected wallet, together with the slot id the
 * contract knows it by (`withdrawJar(id)` / `breakJar(id)`), plus its live
 * reward and bonus preview (Incentives 1 and 2 - see SavingsJar.sol).
 */
export interface OwnedJar {
  /** Slot id on-chain (0 to MAX_JARS_PER_WALLET - 1). */
  id: number;
  data: JarData;
  /** `data.unlockTime` as a plain number of seconds. */
  unlockTime: number;
  /** `data.createdAt` as a plain number of seconds. */
  createdAt: number;
  /** Seconds left according to the clock at the last chain refresh (0 = matured). */
  timeRemaining: number;
  isUnlocked: boolean;
  /** This jar's exact share of the reward pool right now (`pendingReward()`). */
  pendingReward: bigint;
  /** This jar's time-weighted bonus if withdrawn right now (`previewBonus()`), already capped at the pool balance. */
  previewBonus: bigint;
}

/** `SavingsJar.getTier()` return value, in ascending order. */
export type JarTier = "Bronze" | "Silver" | "Gold" | "Platinum";

export const TIER_LABELS: readonly JarTier[] = ["Bronze", "Silver", "Gold", "Platinum"];

/**
 * The lifecycle stage of the approve -> create / withdraw / break flow.
 * Drives every button label and the <StatusBadge />.
 */
export type TxStage =
  | "idle"
  | "approving"
  | "approved"
  | "creating"
  | "created"
  | "withdrawing"
  | "withdrawn"
  | "breaking"
  | "broken"
  | "funding"
  | "funded"
  | "error";

/** Normalised transaction state handed to the UI. */
export interface TxState {
  stage: TxStage;
  /** Human readable line shown next to the buttons. */
  message: string;
  /** Hash of the transaction currently in flight (or just mined). */
  hash: `0x${string}` | null;
  /** Formatted, user-safe error string. */
  error: string | null;
}

/** Status vocabulary understood by <StatusBadge />. */
export type BadgeStatus = "idle" | "loading" | "success" | "error";

export type { savingsJarAbi };
