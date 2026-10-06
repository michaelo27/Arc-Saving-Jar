"use client";

import { useCallback, useState } from "react";

import AddToJarCard from "@/components/AddToJarCard";
import BreakJarModal from "@/components/BreakJarModal";
import CountdownTimer from "@/components/CountdownTimer";
import CreateJarForm from "@/components/CreateJarForm";
import FundBonusPoolCard from "@/components/FundBonusPoolCard";
import GiftLinkCard from "@/components/GiftLinkCard";
import JarVisual from "@/components/JarVisual";
import StatusBadge from "@/components/StatusBadge";
import { EXPLORER_URL, SAVINGS_JAR_ADDRESS, USDC_ADDRESS } from "@/config/contracts";
import { ARC_TESTNET_ID, arcMainnet } from "@/config/wagmi";
import type { useSavingsJar } from "@/hooks/useSavingsJar";
import {
  explorerTxUrl,
  formatDuration,
  formatDurationApprox,
  formatUsd,
  penaltyOf,
  returnedAfterPenalty,
  truncateAddress,
} from "@/lib/format";

type Jar = ReturnType<typeof useSavingsJar>;

export interface JarDashboardProps {
  jar: Jar;
  /**
   * Rendered by /demo with mock data. Writes are intercepted so a reviewer can
   * click through the full UX without a wallet or a deployed contract.
   */
  demo?: boolean;
}

/**
 * Everything that happens after the wallet is connected. A wallet can hold
 * several jars, so a row of tabs (<JarTabs />) picks which one is on screen,
 * and "+ New jar" opens the create form at any time:
 *   STATE 2 - create form (no jar selected)  -> <CreateJarForm />
 *   STATE 3 - selected jar locked            -> jar visual + countdown + break flow
 *   STATE 4 - selected jar matured           -> congratulations + one-click withdraw
 */
export default function JarDashboard({ jar, demo = false }: JarDashboardProps) {
  const [breakOpen, setBreakOpen] = useState(false);

  const handleBreak = useCallback(async () => {
    if (demo) {
      console.log("[demo] breakJar simulated - 10% discipline fee would stay in the contract");
      setBreakOpen(false);
      return;
    }
    console.log("[JarDashboard] breakJar confirmed by user");
    const ok = await jar.breakJar();
    if (ok) setBreakOpen(false);
  }, [demo, jar]);

  const handleWithdraw = useCallback(async () => {
    if (demo) {
      console.log("[demo] withdrawJar simulated - the full deposit would return to the wallet");
      return;
    }
    console.log("[JarDashboard] withdrawJar requested");
    await jar.withdrawJar();
  }, [demo, jar]);

  /* ------------------------------------------------------------------------ */
  /*  STATE 4 - matured jar                                                   */
  /* ------------------------------------------------------------------------ */
  if (jar.isJarUnlocked) {
    const savedFor =
      jar.lockDurationSeconds > 0
        ? formatDurationApprox(jar.lockDurationSeconds)
        : "your full lock period";

    return (
      <Shell jar={jar}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="card flex animate-fade-up flex-col items-center px-6 py-10 text-center">
            <p className="text-3xl">🎉</p>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
              Your Jar is Ready!
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              You saved <span className="font-semibold text-white">{formatUsd(jar.jarData.amount)}</span>{" "}
              USDC for <span className="font-semibold text-accent">{savedFor}</span>. Great
              discipline!
            </p>

            {jar.jarTargetAmount > 0n ? (
              <span className="mt-3 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
                🎯 Goal {jar.jarData.amount >= jar.jarTargetAmount ? "reached" : "jar"} · target{" "}
                {formatUsd(jar.jarTargetAmount)}
              </span>
            ) : null}

            {jar.jarPendingReward > 0n || jar.jarPreviewBonus > 0n ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                {jar.jarPendingReward > 0n ? (
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-medium text-accent">
                    +{formatUsd(jar.jarPendingReward)} reward share
                  </span>
                ) : null}
                {jar.jarPreviewBonus > 0n ? (
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-gold">
                    +{formatUsd(jar.jarPreviewBonus)} time bonus
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8">
              <JarVisual
                fillPercentage={100}
                amount={jar.jarData.amount}
                jarName={jar.jarData.jarName}
                isUnlocked
              />
            </div>

            <button type="button" onClick={handleWithdraw} disabled={jar.isLoading} className="btn-success mt-9 w-full max-w-sm !py-4 !text-base">
              {jar.tx.stage === "withdrawing" ? (
                <>
                  <Spinner /> Withdrawing...
                </>
              ) : jar.tx.stage === "withdrawn" ? (
                <>Withdrawn ✓</>
              ) : (
                <>
                  Withdraw{" "}
                  {formatUsd(jar.jarData.amount + jar.jarPendingReward + jar.jarPreviewBonus)} USDC
                </>
              )}
            </button>

            <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-2">
              <StatusBadge
                status={badgeFor(jar.tx.stage, jar.tx.error)}
                label={jar.tx.message || jar.tx.error || undefined}
                hideWhenIdle={false}
              />
              {jar.txHash ? <TxLink hash={jar.txHash} /> : null}
              <p className="text-xs text-muted">
                {jar.jarPendingReward > 0n || jar.jarPreviewBonus > 0n
                  ? "Principal, reward share and time bonus all return in a single transaction. No fees."
                  : "The full deposit returns to your wallet in a single transaction. No fees."}
              </p>
            </div>
          </section>

          <Aside jar={jar} />
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  STATE 3 - locked jar                                                    */
  /* ------------------------------------------------------------------------ */
  if (jar.isJarActive) {
    const amount = jar.jarData.amount;

    return (
      <Shell jar={jar}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="card flex animate-fade-up flex-col items-center px-5 py-8 sm:px-8">
            <JarVisual
              fillPercentage={jar.progressPercent}
              amount={amount}
              jarName={jar.jarData.jarName}
              isUnlocked={false}
            />

            {/* Piggy savings: goal reached before maturity -> the saver picks:
                withdraw everything now, or keep it locked until maturity. */}
            {jar.isJarGoalReached ? (
              <div className="mt-6 w-full max-w-md rounded-2xl border border-gold/45 bg-gold/10 px-5 py-4 text-center">
                <p className="text-sm font-semibold text-gold">
                  🎯 Goal reached -{" "}
                  <span className="font-mono">{formatUsd(jar.jarData.amount)}</span> saved!
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Withdraw everything now, or wait for the maturity date and
                  keep earning the time bonus. Your call.
                </p>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={jar.isLoading}
                  className="btn-success mt-3 w-full"
                >
                  {jar.tx.stage === "withdrawing" ? (
                    <>
                      <Spinner /> Withdrawing...
                    </>
                  ) : jar.tx.stage === "withdrawn" ? (
                    <>Withdrawn ✓</>
                  ) : (
                    <>
                      Withdraw{" "}
                      {formatUsd(
                        jar.jarData.amount + jar.jarPendingReward + jar.jarPreviewBonus,
                      )}{" "}
                      USDC now
                    </>
                  )}
                </button>
              </div>
            ) : null}

            <CountdownTimer
              unlockTimestamp={Number(jar.jarData.unlockTime)}
              className="mt-8 w-full max-w-md"
            />

            <div className="mt-6 w-full max-w-md">
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="font-medium uppercase tracking-[0.14em] text-muted">
                  Time Elapsed
                </span>
                <span className="font-mono text-accent">{jar.progressPercent.toFixed(1)}%</span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-navy-900"
                role="progressbar"
                aria-valuenow={Math.round(jar.progressPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share of the lock period elapsed"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-dim via-accent to-accent transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(1.5, jar.progressPercent)}%` }}
                />
              </div>
              <p className="mt-3 text-center text-sm text-muted">
                Unlocks on:{" "}
                <span className="font-medium text-white">
                  {new Date(Number(jar.jarData.unlockTime) * 1000).toLocaleString("en-US", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </span>
              </p>
            </div>

            {jar.jarPendingReward > 0n || jar.jarPreviewBonus > 0n ? (
              <p className="mt-4 max-w-md text-center text-xs text-muted">
                So far this jar has earned{" "}
                {jar.jarPendingReward > 0n ? (
                  <span className="font-mono text-accent">{formatUsd(jar.jarPendingReward)} reward</span>
                ) : null}
                {jar.jarPendingReward > 0n && jar.jarPreviewBonus > 0n ? " + " : null}
                {jar.jarPreviewBonus > 0n ? (
                  <span className="font-mono text-gold">{formatUsd(jar.jarPreviewBonus)} bonus</span>
                ) : null}
                . Break it early and you forfeit both - only a full, on-time withdrawal pays them out.
              </p>
            ) : null}

            {/* Piggy savings: top the jar up bit by bit while it is locked. */}
            <div className="mt-6 w-full max-w-md">
              <AddToJarCard
                jarAmount={amount}
                targetAmount={jar.jarTargetAmount}
                isGoalReached={jar.isJarGoalReached}
                usdcBalance={jar.usdcBalance}
                allowance={jar.allowance}
                tx={jar.tx}
                onApprove={jar.approveUSDC}
                onAdd={jar.addToJar}
              />
              {demo ? (
                <div className="mt-5 w-full max-w-md rounded-2xl border border-accent/25 bg-accent/5 p-5 text-left">
                  <h3 className="text-sm font-semibold text-white">🎁 Share a gift link</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Live jars can generate a link for supporters. This mock walkthrough does not create payment links or send transactions.
                  </p>
                </div>
              ) : (
                <GiftLinkCard
                  ownerAddress={jar.address}
                  jarId={jar.selectedJarId}
                  jarName={jar.jarData.jarName}
                  jarAmount={amount}
                  targetAmount={jar.jarTargetAmount}
                  canReceiveGift={!jar.isJarGoalReached}
                />
              )}
            </div>

            <div className="mt-8 flex w-full max-w-md flex-col items-center gap-3">
              <StatusBadge
                status={badgeFor(jar.tx.stage, jar.tx.error)}
                label={jar.tx.message || jar.tx.error || undefined}
              />
              {jar.txHash ? <TxLink hash={jar.txHash} /> : null}

              {jar.isJarGoalReached ? (
                <p className="text-center text-xs text-muted">
                  This jar hit its goal, so the contract refuses to break it -
                  a full withdrawal is always the better move here.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[JarDashboard] opening break-jar confirmation");
                      setBreakOpen(true);
                    }}
                    disabled={jar.isLoading}
                    className="btn-danger w-full"
                  >
                    🚨 Break Jar (10% Penalty)
                  </button>
                  <p className="text-center text-xs text-muted">
                    Breaking early returns{" "}
                    <span className="font-mono text-white">{formatUsd(returnedAfterPenalty(amount))}</span>{" "}
                    and keeps{" "}
                    <span className="font-mono text-gold">{formatUsd(penaltyOf(amount))}</span> in the
                    contract as a discipline fee.
                  </p>
                </>
              )}
            </div>
          </section>

          <Aside jar={jar} />
        </div>

        <BreakJarModal
          open={breakOpen}
          amount={amount}
          jarName={jar.jarData.jarName}
          onCancel={() => setBreakOpen(false)}
          onConfirm={handleBreak}
          busy={jar.isLoading}
          tx={jar.tx}
        />
      </Shell>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  STATE 2 - connected, no active jar                                      */
  /* ------------------------------------------------------------------------ */
  return (
    <Shell jar={jar}>
      <div className="flex w-full flex-col items-center gap-6">
        <CreateJarForm
          usdcBalance={jar.usdcBalance}
          allowance={jar.allowance}
          gasBalanceFormatted={jar.gasBalanceFormatted}
          tx={jar.tx}
          onApprove={jar.approveUSDC}
          onCreateJar={jar.createJar}
        />
        <Aside jar={jar} className="w-full max-w-2xl" />
      </div>
    </Shell>
  );
}

/* ========================================================================== */
/*  Shared chrome                                                             */
/* ========================================================================== */

function Shell({ jar, children }: { jar: Jar; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      {jar.demoMode ? (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-3 text-center text-sm text-accent">
          Demo mode - mock on-chain data, no wallet required. Pick another state above.
        </div>
      ) : null}
      <Notices jar={jar} />
      <JarTabs jar={jar} />
      {children}
      <Footer />
    </div>
  );
}

/**
 * One tab per active jar plus a "+ New jar" tab. Hidden until the wallet has at
 * least one jar (a first-time visitor just sees the create form).
 */
function JarTabs({ jar }: { jar: Jar }) {
  if (jar.jars.length === 0) return null;

  const creating = jar.selectedJarId === null;
  const tabBase = "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition disabled:opacity-60";
  const tabOn = "border-accent bg-accent/15 text-accent";
  const tabOff = "border-navy-500 bg-navy-800/60 text-muted hover:border-accent/40 hover:text-white";

  return (
    <nav aria-label="Your jars" className="mb-6 flex flex-wrap items-center gap-2">
      {jar.jars.map((entry) => {
        const selected = entry.id === jar.selectedJarId;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => jar.selectJar(entry.id)}
            disabled={jar.isLoading}
            aria-pressed={selected}
            className={`${tabBase} ${selected ? tabOn : tabOff}`}
          >
            <span aria-hidden="true">
              {entry.isUnlocked ? "🔓" : entry.data.targetAmount > 0n ? "🎯" : "🫙"}
            </span>
            <span className="max-w-[10rem] truncate font-medium">
              {entry.data.jarName || `Jar ${entry.id + 1}`}
            </span>
            <span className="font-mono text-xs opacity-80">{formatUsd(entry.data.amount)}</span>
          </button>
        );
      })}

      {jar.canCreateMore ? (
        <button
          type="button"
          onClick={() => jar.selectJar(null)}
          disabled={jar.isLoading}
          aria-pressed={creating}
          className={`${tabBase} border-dashed ${creating ? tabOn : tabOff}`}
        >
          <span aria-hidden="true">＋</span>
          <span className="font-medium">New jar</span>
        </button>
      ) : (
        <span className="px-2 text-xs text-muted">
          Jar limit reached ({jar.maxJars}/{jar.maxJars})
        </span>
      )}
    </nav>
  );
}

function Notices({ jar }: { jar: Jar }) {
  if (jar.demoMode) return null;

  if (jar.isWrongNetwork) {
    return (
      <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-gold/45 bg-gold/10 px-5 py-4 sm:flex-row sm:items-center">
        <p className="text-sm text-gold">
          Your wallet is on <span className="font-semibold">chain {jar.chainId}</span>. Arc Savings
          Jar lives on Arc Mainnet (5042).
        </p>
        <button type="button" onClick={jar.switchToArc} disabled={jar.isSwitchingChain} className="btn-gold !px-4 !py-2 !text-xs">
          {jar.isSwitchingChain ? "Switching..." : "Switch to Arc"}
        </button>
      </div>
    );
  }

  if (!jar.isContractDeployed) {
    return (
      <div className="mb-6 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-4">
        <p className="text-sm font-semibold text-accent">Contract address not configured yet</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Paste your deployed <span className="font-mono text-white">SavingsJar</span> address into{" "}
          <span className="font-mono text-white">config/contracts.ts</span> (or set{" "}
          <span className="font-mono text-white">NEXT_PUBLIC_SAVINGS_JAR_ADDRESS</span> in{" "}
          <span className="font-mono text-white">.env.local</span>). Current value:{" "}
          <span className="font-mono text-white">{truncateAddress(SAVINGS_JAR_ADDRESS)}</span>.
        </p>
        <p className="mt-2 font-mono text-xs text-muted/80">
          npm run deploy:mainnet &nbsp;# or deploy:testnet for a dry run with faucet USDC
        </p>
      </div>
    );
  }

  if (jar.isJarError && jar.jarError) {
    return (
      <div className="mb-6 rounded-2xl border border-red-400/40 bg-red-500/10 px-5 py-4">
        <p className="text-sm font-semibold text-red-300">Could not read your jar</p>
        <p className="mt-1 text-sm text-red-200/80">{jar.jarError}</p>
        <button type="button" onClick={jar.refetchAll} className="btn-ghost mt-3 !px-3 !py-1.5 !text-xs">
          Retry
        </button>
      </div>
    );
  }

  return null;
}

function Aside({ jar, className = "" }: { jar: Jar; className?: string }) {
  const chainLabel = jar.chainId === ARC_TESTNET_ID ? "Arc Testnet" : arcMainnet.name;
  const explorerChainUrl = jar.chainId === ARC_TESTNET_ID ? "https://explorer.testnet.arc.io" : EXPLORER_URL;

  return (
    <aside className={`flex flex-col gap-4 ${className}`}>
      {/* ------------------------------------------------------------ wallet */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Your wallet</h3>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-sm text-white">
            <span className="h-5 w-5 rounded-full bg-gradient-to-br from-accent to-accent-dim" aria-hidden="true" />
            {truncateAddress(jar.address)}
          </span>
          <a
            href={`${explorerChainUrl}/address/${jar.address ?? ""}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-accent/80 underline-offset-4 hover:underline"
          >
            view
          </a>
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          <StatRow label="USDC balance" value={`${jar.usdcBalanceFormatted} USDC`} loading={jar.isBalanceLoading} />
          <StatRow label="Gas (native USDC)" value={`${jar.gasBalanceFormatted} USDC`} />
          <StatRow label="Network" value={chainLabel} />
          {jar.jars.length > 0 ? (
            <>
              <StatRow label="Active jars" value={`${jar.jars.length} / ${jar.maxJars}`} />
              <StatRow label="Total locked" value={formatUsd(jar.totalLocked)} tone="accent" />
              {jar.totalPendingRewards > 0n ? (
                <StatRow label="Unclaimed reward share" value={formatUsd(jar.totalPendingRewards)} tone="accent" />
              ) : null}
            </>
          ) : null}
          {jar.isJarActive ? (
            <>
              <StatRow label="This jar" value={formatUsd(jar.jarData.amount)} tone="accent" />
              {jar.jarTargetAmount > 0n ? (
                <StatRow
                  label="Savings goal"
                  value={`${formatUsd(jar.jarTargetAmount)} (${jar.jarGoalProgressPercent.toFixed(0)}%)`}
                  tone="gold"
                />
              ) : null}
              <StatRow
                label="Lock length"
                value={jar.lockDurationSeconds > 0 ? formatDuration(jar.lockDurationSeconds) : "—"}
              />
              <StatRow
                label={jar.isJarUnlocked ? "Status" : "Time left"}
                value={
                  jar.isJarUnlocked
                    ? "Unlocked"
                    : formatDurationApprox(jar.timeRemaining)
                }
                tone={jar.isJarUnlocked ? "gold" : undefined}
              />
            </>
          ) : null}
        </dl>
      </div>

      {/* ------------------------------------------------------------ rewards */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Your rewards
          </h3>
          <TierBadge tier={jar.tier} />
        </div>
        <dl className="mt-3 space-y-2.5 text-sm">
          <StatRow label="Points" value={jar.points.toLocaleString("en-US")} tone="accent" />
          <StatRow
            label="Bonus rate"
            value={`${(Number(jar.bonusAprBps) / 100).toFixed(2)}% / year`}
          />
          <StatRow label="Bonus pool available" value={`${jar.bonusPoolBalanceFormatted} USDC`} tone="gold" />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted/80">
          Points and bonus are earned by holding a jar to maturity - breaking early forfeits both.
          Points are 1 USDC held for 1 day; tiers are Bronze &rarr; Silver (1,000) &rarr; Gold
          (10,000) &rarr; Platinum (50,000).
        </p>

        {jar.isOwner ? (
          <div className="mt-4">
            <FundBonusPoolCard
              usdcBalance={jar.usdcBalance}
              allowance={jar.allowance}
              bonusPoolBalanceFormatted={jar.bonusPoolBalanceFormatted}
              bonusAprBps={jar.bonusAprBps}
              tx={jar.tx}
              onApprove={jar.approveUSDC}
              onFund={jar.fundBonusPool}
            />
          </div>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- protocol */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          On-chain transparency
        </h3>
        <dl className="mt-3 space-y-2.5 text-sm">
          <StatRow label="Discipline fees held" value={`${jar.penaltiesFormatted} USDC`} tone="gold" />
          <StatRow label="Jars created (all time)" value={jar.totalJarsCreated.toString()} />
          <StatRow label="Returned to savers" value={`${formatUsd(jar.totalWithdrawn)}`} />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted/80">
          Penalties are never withdrawable by a saver and never leave the contract until the owner
          sweeps them - readable by anyone at{" "}
          <span className="font-mono text-white/80">getAccumulatedPenalties()</span>.
        </p>
        <a
          href={`${explorerChainUrl}/address/${SAVINGS_JAR_ADDRESS}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block text-xs text-accent/80 underline-offset-4 hover:underline"
        >
          Verify SavingsJar on the explorer →
        </a>
      </div>
    </aside>
  );
}

const TIER_STYLE: Record<Jar["tier"], string> = {
  Bronze: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  Silver: "border-slate-300/30 bg-slate-300/10 text-slate-200",
  Gold: "border-gold/40 bg-gold/10 text-gold",
  Platinum: "border-accent/40 bg-accent/10 text-accent",
};

function TierBadge({ tier }: { tier: Jar["tier"] }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TIER_STYLE[tier]}`}>
      {tier}
    </span>
  );
}

function StatRow({
  label,
  value,
  tone,
  loading = false,
}: {
  label: string;
  value: string;
  tone?: "accent" | "gold";
  loading?: boolean;
}) {
  const toneClass = tone === "accent" ? "text-accent" : tone === "gold" ? "text-gold" : "text-white";
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono text-xs tabular-nums ${toneClass}`}>
        {loading ? <span className="inline-block h-3 w-16 animate-pulse rounded bg-navy-500" /> : value}
      </dd>
    </div>
  );
}

function TxLink({ hash }: { hash: `0x${string}` }) {
  return (
    <a
      href={explorerTxUrl(EXPLORER_URL, hash)}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-xs text-accent/80 underline-offset-4 hover:underline"
    >
      tx {truncateAddress(hash)} ↗
    </a>
  );
}

function Footer() {
  return (
    <footer className="mt-14 border-t border-navy-500/70 pt-6 text-center text-xs text-muted/70">
      <p>
        SavingsJar{" "}
        <span className="font-mono text-white/70">{truncateAddress(SAVINGS_JAR_ADDRESS)}</span> ·
        USDC <span className="font-mono text-white/70">{truncateAddress(USDC_ADDRESS)}</span> · Arc
        Mainnet (5042)
      </p>
      <p className="mt-1">Non-custodial. The contract has no upgrade path and no pause switch.</p>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */

function badgeFor(stage: string, error: string | null): "idle" | "loading" | "success" | "error" {
  if (stage === "error" || error) return "error";
  if (["approving", "creating", "toppingUp", "withdrawing", "breaking"].includes(stage)) return "loading";
  if (["approved", "created", "toppedUp", "withdrawn", "broken"].includes(stage)) return "success";
  return "idle";
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export { JarDashboard };
