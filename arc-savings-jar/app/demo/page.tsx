"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import Header from "@/components/Header";
import JarDashboard from "@/components/JarDashboard";
import Landing from "@/components/Landing";
import type { useSavingsJar } from "@/hooks/useSavingsJar";
import type { JarData, JarTier, OwnedJar, TxState } from "@/lib/types";

/**
 * /demo - a wallet-free walkthrough of all four UI states.
 *
 * Grant reviewers (and anyone without USDC on Arc) can click through the whole
 * product - landing, create form, locked jar with a live countdown, and the
 * matured jar - against mock on-chain data. No transaction is ever broadcast
 * from this route.
 */

type Jar = ReturnType<typeof useSavingsJar>;
type DemoState = "1" | "2" | "3" | "4" | "5";

const STATES: readonly { id: DemoState; label: string; hint: string }[] = [
  { id: "1", label: "1 · Not connected", hint: "Landing page" },
  { id: "2", label: "2 · No active jar", hint: "Create form" },
  { id: "3", label: "3 · Jar locked", hint: "Countdown + piggy top-ups" },
  { id: "4", label: "4 · Jar unlocked", hint: "Withdraw" },
  { id: "5", label: "5 · Goal reached", hint: "Withdraw early or wait" },
];

const DEMO_ADDRESS = "0x7A51c9d3E4f0b8A6D2c1F5e9B0a4C8d7E6f1A2b3" as `0x${string}`;
const DEMO_JAR_CONTRACT = "0x5aVcD1eF2b3A49586c7D8e9F0a1B2c3D4e5F6071" as `0x${string}`;

const IDLE_TX: TxState = { stage: "idle", message: "", hash: null, error: null };

export default function DemoPage() {
  const [state, setState] = useState<DemoState>("3");
  // Which mock jar is on screen (null = the "new jar" form), so the jar tabs work in the demo too.
  const [selectedId, setSelectedId] = useState<number | null>(0);

  const jar = useMemo<Jar>(() => buildMockJar(state, selectedId, setSelectedId), [state, selectedId]);

  return (
    <main className="relative flex min-h-screen flex-col">
      <Header />

      <div className="border-b border-navy-500/70 bg-navy-900/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <span className="mr-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            UI walkthrough
          </span>
          {STATES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setState(entry.id);
                setSelectedId(0);
              }}
              title={entry.hint}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                state === entry.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-navy-500 bg-navy-800/60 text-muted hover:border-accent/40 hover:text-white"
              }`}
              aria-pressed={state === entry.id}
            >
              {entry.label}
            </button>
          ))}
          <Link
            href="/"
            className="ml-auto rounded-xl border border-navy-500 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-white"
          >
            ← Back to the live app
          </Link>
        </div>
      </div>

      {state === "1" ? (
        <Landing />
      ) : (
        <div className="flex-1">
          <JarDashboard jar={jar} demo />
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

function buildMockJar(
  state: DemoState,
  selectedId: number | null,
  setSelectedId: (id: number | null) => void,
): Jar {
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;
  const ninetyDays = 7_776_000;

  /** Shared zero values for the piggy-savings bookkeeping fields. */
  const flat = {
    bonusAccrued: 0n,
    pointsAccrued: 0n,
  };

  // Jar 0: a goal jar ("New Car Fund") created 45 days ago with a 90-day lock.
  // Piggy savings: the saver has topped it up bit by bit towards a 2,000 USDC
  // target. In state 5 the latest top-up just hit the target, so the saver can
  // withdraw early or wait for maturity. In state 4 the lock has expired.
  const vacationData: JarData =
    state === "4"
      ? {
          amount: 1_250_500_000n, // 1,250.50 USDC
          unlockTime: BigInt(now - 60),
          createdAt: BigInt(now - 60 - ninetyDays),
          rewardDebt: 0n,
          targetAmount: 0n,
          ...flat,
          lastFundedAt: BigInt(now - 60 - ninetyDays),
          isActive: true,
          jarName: "My Vacation Fund",
        }
      : state === "5"
        ? {
            amount: 2_000_000_000n, // goal just reached
            unlockTime: BigInt(now + 45 * day),
            createdAt: BigInt(now - 45 * day),
            rewardDebt: 0n,
            targetAmount: 2_000_000_000n,
            ...flat,
            lastFundedAt: BigInt(now - 12 * 3_600),
            isActive: true,
            jarName: "New Car Fund",
          }
        : {
            amount: 1_250_500_000n,
            unlockTime: BigInt(now + ninetyDays / 2),
            createdAt: BigInt(now - ninetyDays / 2),
            rewardDebt: 0n,
            targetAmount: 2_000_000_000n, // 62.5% of the way there
            ...flat,
            lastFundedAt: BigInt(now - 3 * day),
            isActive: true,
            jarName: "New Car Fund",
          };

  // Jar 1: a second, still-locked classic jar (no goal) so the tabs have
  // something to switch between.
  const emergencyData: JarData = {
    amount: 500_000_000n, // 500 USDC
    unlockTime: BigInt(now + 20 * day),
    createdAt: BigInt(now - 10 * day),
    rewardDebt: 0n,
    targetAmount: 0n,
    ...flat,
    lastFundedAt: BigInt(now - 10 * day),
    isActive: true,
    jarName: "Emergency Fund",
  };

  // Demo-only stand-ins for what pendingReward()/previewBonus() would return -
  // enough to show the UI's reward/bonus badges without wiring real math here.
  const mockPendingReward = (data: JarData): bigint => (data.amount * 6n) / 1000n; // ~0.6%
  const mockPreviewBonus = (data: JarData): bigint => {
    const heldSeconds = BigInt(Math.max(0, now - Number(data.createdAt)));
    return (data.amount * 500n * heldSeconds) / (10_000n * 31_536_000n); // 5% APR, simple interest
  };

  const toOwned = (id: number, data: JarData): OwnedJar => {
    const unlockTime = Number(data.unlockTime);
    const hasGoal = data.targetAmount > 0n;
    return {
      id,
      data,
      unlockTime,
      createdAt: Number(data.createdAt),
      timeRemaining: Math.max(0, unlockTime - now),
      isUnlocked: unlockTime <= now,
      pendingReward: mockPendingReward(data),
      previewBonus: mockPreviewBonus(data),
      isGoalReached: hasGoal && data.amount >= data.targetAmount,
      goalProgressPercent: hasGoal
        ? Math.min(100, Number((data.amount * 10_000n) / data.targetAmount) / 100)
        : 0,
      remainingToGoal: hasGoal && data.amount < data.targetAmount ? data.targetAmount - data.amount : 0n,
    };
  };

  // State 2 = a wallet with no jars yet. States 3 and 4 = a wallet with two jars.
  const jars: OwnedJar[] = state === "2" ? [] : [toOwned(0, vacationData), toOwned(1, emergencyData)];
  const selected: OwnedJar | null =
    state === "2" || selectedId === null ? null : (jars.find((entry) => entry.id === selectedId) ?? jars[0] ?? null);

  const emptyJar: JarData = {
    amount: 0n,
    unlockTime: 0n,
    createdAt: 0n,
    rewardDebt: 0n,
    targetAmount: 0n,
    bonusAccrued: 0n,
    pointsAccrued: 0n,
    lastFundedAt: 0n,
    isActive: false,
    jarName: "",
  };
  const jarData = selected ? selected.data : emptyJar;
  const active = selected !== null;
  const lockDuration = selected ? Math.max(0, selected.unlockTime - selected.createdAt) : 0;
  const timeRemaining = selected ? selected.timeRemaining : 0;
  const totalLocked = jars.reduce<bigint>((sum, entry) => sum + entry.data.amount, 0n);

  const noopWrite = async () => {
    console.log("[demo] write suppressed - this route never broadcasts a transaction");
    return false;
  };

  return {
    address: DEMO_ADDRESS,
    isConnected: true,
    isConnecting: false,
    chainId: 5042,
    isWrongNetwork: false,
    switchToArc: () => undefined,
    isSwitchingChain: false,

    jars,
    selectedJarId: selected ? selected.id : null,
    selectJar: setSelectedId,
    maxJars: 10,
    canCreateMore: jars.length < 10,
    totalLocked,

    points: 6_240n,
    tier: "Silver" as JarTier,
    bonusPoolBalance: 92_500_000_000n, // 92,500 USDC
    bonusPoolBalanceFormatted: "92500.0",
    bonusAprBps: 500n,
    totalPendingRewards: jars.reduce<bigint>((sum, entry) => sum + entry.pendingReward, 0n),

    jarData,
    timeRemaining,
    isJarActive: active,
    isJarUnlocked: selected ? selected.isUnlocked : false,
    isJarLoading: false,
    isJarError: false,
    jarError: null,
    jarPendingReward: selected ? selected.pendingReward : 0n,
    jarPreviewBonus: selected ? selected.previewBonus : 0n,
    jarTargetAmount: selected ? selected.data.targetAmount : 0n,
    isJarGoalReached: selected ? selected.isGoalReached : false,
    jarGoalProgressPercent: selected ? selected.goalProgressPercent : 0,
    jarRemainingToGoal: selected ? selected.remainingToGoal : 0n,
    createdAt: selected ? selected.createdAt : 0,
    lockDurationSeconds: lockDuration,
    elapsedSeconds: active ? Math.max(0, lockDuration - timeRemaining) : 0,
    progressPercent: active && lockDuration > 0 ? ((lockDuration - timeRemaining) / lockDuration) * 100 : 0,

    usdcBalance: 4_820_750_000n, // 4,820.75 USDC
    usdcBalanceFormatted: "4820.75",
    isBalanceLoading: false,
    allowance: state === "2" || selected === null ? 0n : 10_000_000_000n,
    gasBalanceFormatted: "1.842",

    penalties: 128_400_000n, // 128.40 USDC of discipline fees in the contract
    penaltiesFormatted: "128.4",
    totalJarsCreated: 37n,
    totalWithdrawn: 9_412_000_000n,
    totalBrokenReturned: 1_155_600_000n,

    createJar: noopWrite,
    addToJar: noopWrite,
    withdrawJar: noopWrite,
    breakJar: noopWrite,
    approveUSDC: noopWrite,
    fundBonusPool: noopWrite,

    tx: IDLE_TX,
    txHash: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isConfirming: false,
    isConfirmed: false,
    receiptStatus: null,
    resetTx: () => undefined,

    demoMode: true,
    isContractDeployed: true,
    contractAddress: DEMO_JAR_CONTRACT,
    contractOwner: DEMO_ADDRESS, // the demo wallet is shown as the owner so the fund-pool card is visible here
    isOwner: true,
    refetchAll: () => undefined,
  } as Jar;
}
