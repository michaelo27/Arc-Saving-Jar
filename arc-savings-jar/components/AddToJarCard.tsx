"use client";

import { useCallback, useMemo, useState } from "react";
import { formatUnits } from "viem";

import StatusBadge from "@/components/StatusBadge";
import { USDC_DECIMALS } from "@/config/contracts";
import { parseUsdc } from "@/hooks/useSavingsJar";
import { formatUsd, formatUsdc } from "@/lib/format";
import type { BadgeStatus, TxState } from "@/lib/types";

export interface AddToJarCardProps {
  /** Current balance of the selected jar, raw USDC units. */
  jarAmount: bigint;
  /** Piggy-savings goal of the selected jar. `0n` = classic jar (no goal). */
  targetAmount: bigint;
  /** True once a goal jar has reached its target. */
  isGoalReached: boolean;
  /** Wallet USDC balance, raw units (6 decimals). */
  usdcBalance: bigint;
  /** Allowance already granted to SavingsJar, raw units. */
  allowance: bigint;
  tx: TxState;
  onApprove: (amount: bigint) => Promise<boolean>;
  onAdd: (amountText: string) => Promise<boolean>;
}

/**
 * Piggy savings 🐷 - top up a locked jar bit by bit (SavingsJar.addToJar).
 *
 * Goal jars show their progress towards the target and refuse to take more
 * than the goal; once the goal is reached the card flips into a "goal
 * reached" note (the dashboard then offers the early withdrawal). Classic
 * jars accept uncapped top-ups. Same two-step approve-then-call flow as
 * <CreateJarForm />: the approve step is skipped whenever the existing
 * allowance already covers the amount typed in.
 */
export default function AddToJarCard({
  jarAmount,
  targetAmount,
  isGoalReached,
  usdcBalance,
  allowance,
  tx,
  onApprove,
  onAdd,
}: AddToJarCardProps) {
  const [amountInput, setAmountInput] = useState("");

  const hasGoal = targetAmount > 0n;
  const remainingToGoal = hasGoal && jarAmount < targetAmount ? targetAmount - jarAmount : 0n;
  const goalProgressPercent = hasGoal
    ? Math.min(100, Number((jarAmount * 10_000n) / targetAmount) / 100)
    : 0;

  /* ------------------------------ derived --------------------------------- */

  const parsed = useMemo<{ value: bigint; error: string | null }>(() => {
    if (amountInput.trim().length === 0) return { value: 0n, error: null };
    try {
      return { value: parseUsdc(amountInput), error: null };
    } catch (error) {
      return { value: 0n, error: error instanceof Error ? error.message : "Invalid amount" };
    }
  }, [amountInput]);

  const amount = parsed.value;
  const overshootsGoal = hasGoal && amount > remainingToGoal;
  const exceedsBalance = amount > 0n && amount > usdcBalance;
  const amountError = parsed.error ?? (overshootsGoal ? "That would go past the savings goal" : exceedsBalance ? "Amount exceeds your USDC balance" : null);

  const canSubmitAmount = amount > 0n && !amountError;
  const allowanceCoversAmount = canSubmitAmount && allowance >= amount;
  // A goal jar that has hit its target takes no more top-ups.
  const disabledByGoal = hasGoal && isGoalReached;

  const busy = tx.stage === "approving" || tx.stage === "toppingUp";

  const badgeStatus: BadgeStatus =
    tx.stage === "error"
      ? "error"
      : busy
        ? "loading"
        : tx.stage === "approved" || tx.stage === "toppedUp"
          ? "success"
          : "idle";

  const badgeLabel =
    tx.stage === "error"
      ? (tx.error ?? "Something went wrong")
      : busy || tx.stage === "approved" || tx.stage === "toppedUp"
        ? tx.message
        : "";

  /* ------------------------------ actions --------------------------------- */

  const handleApprove = useCallback(async () => {
    if (!canSubmitAmount) return;
    console.log("[AddToJarCard] approve requested for", amount.toString(), "raw USDC units");
    await onApprove(amount);
  }, [amount, canSubmitAmount, onApprove]);

  const handleAdd = useCallback(async () => {
    if (!canSubmitAmount || !allowanceCoversAmount) return;
    console.log("[AddToJarCard] addToJar requested", { amount: amountInput });
    const ok = await onAdd(amountInput.trim());
    if (ok) setAmountInput("");
  }, [allowanceCoversAmount, amountInput, canSubmitAmount, onAdd]);

  const fillAmount = useCallback(
    (raw: bigint) => {
      if (raw <= 0n) return;
      setAmountInput(formatUnits(raw, USDC_DECIMALS));
    },
    [],
  );

  /* --------------------------------------------------------------------- */

  return (
    <div className="w-full max-w-md rounded-2xl border border-navy-500 bg-navy-800/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden="true">🐷</span> Piggy savings - add USDC
        </h3>
        {hasGoal ? (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent">
            goal {formatUsd(targetAmount)}
          </span>
        ) : null}
      </div>

      {hasGoal ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-muted">
              Saved{" "}
              <span className="font-mono text-white">{formatUsd(jarAmount)}</span> of{" "}
              <span className="font-mono text-white">{formatUsd(targetAmount)}</span>
            </span>
            <span className="font-mono text-accent">{goalProgressPercent.toFixed(1)}%</span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-navy-900"
            role="progressbar"
            aria-valuenow={Math.round(goalProgressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Share of the savings goal reached"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-dim via-accent to-accent transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(1.5, goalProgressPercent)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Top this jar up whenever you like while it is locked - every deposit
          only starts earning its bonus and points from the moment it lands.
        </p>
      )}

      {disabledByGoal ? (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          🎯 Goal reached! This jar takes no more top-ups - withdraw it now or
          let it ride until maturity.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <label htmlFor="add-to-jar-amount" className="sr-only">
              Amount to add
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-navy-500 bg-navy-900/60 px-3 py-2">
              <input
                id="add-to-jar-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                disabled={busy}
                className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-muted/60"
                aria-invalid={Boolean(amountError)}
              />
              <span className="shrink-0 text-xs text-muted">USDC</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span>
                Balance: <span className="font-mono">{formatUsdc(usdcBalance)}</span>
              </span>
              <span className="flex items-center gap-1">
                {hasGoal && remainingToGoal > 0n ? (
                  <button
                    type="button"
                    className="link-chip"
                    onClick={() => fillAmount(remainingToGoal)}
                    disabled={busy}
                  >
                    Fill goal
                  </button>
                ) : null}
                <button
                  type="button"
                  className="link-chip"
                  onClick={() =>
                    fillAmount(hasGoal && remainingToGoal > 0n && remainingToGoal < usdcBalance ? remainingToGoal : usdcBalance)
                  }
                  disabled={busy || usdcBalance === 0n}
                >
                  Max
                </button>
              </span>
            </div>
            {hasGoal && remainingToGoal > 0n && amount === 0n ? (
              <p className="mt-1 text-[11px] text-muted">
                <span className="font-mono text-accent">{formatUsdc(remainingToGoal)}</span>{" "}
                left to reach the goal.
              </p>
            ) : null}
            {amountError ? <p className="mt-1 text-[11px] text-red-400">{amountError}</p> : null}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {allowanceCoversAmount ? (
              <button
                type="button"
                onClick={handleAdd}
                disabled={!canSubmitAmount || busy}
                className="btn-primary w-full justify-center"
              >
                {tx.stage === "toppingUp" ? (
                  <>
                    <Spinner /> Adding USDC...
                  </>
                ) : (
                  "Add USDC to this jar 🐷"
                )}
              </button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!canSubmitAmount || busy}
                  className="btn-secondary flex-1"
                >
                  {tx.stage === "approving" ? (
                    <>
                      <Spinner /> Approving...
                    </>
                  ) : tx.stage === "approved" ? (
                    "Approved ✓"
                  ) : (
                    "1. Approve USDC"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!canSubmitAmount || busy}
                  className="btn-primary flex-1"
                >
                  {tx.stage === "toppingUp" ? (
                    <>
                      <Spinner /> Adding...
                    </>
                  ) : (
                    "2. Add USDC 🐷"
                  )}
                </button>
              </div>
            )}

            {badgeLabel ? <StatusBadge status={badgeStatus} label={badgeLabel} /> : null}
          </div>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export { AddToJarCard };
