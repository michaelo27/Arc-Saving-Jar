"use client";

import { useCallback, useMemo, useState } from "react";

import StatusBadge from "@/components/StatusBadge";
import { USDC_DECIMALS } from "@/config/contracts";
import { parseUsdc } from "@/hooks/useSavingsJar";
import { formatUsdc } from "@/lib/format";
import type { BadgeStatus, TxState } from "@/lib/types";

export interface FundBonusPoolCardProps {
  /** Wallet USDC balance, raw units (6 decimals). */
  usdcBalance: bigint;
  /** Allowance already granted to SavingsJar, raw units. */
  allowance: bigint;
  /** Current bonus pool balance, formatted (e.g. "92500.0"). */
  bonusPoolBalanceFormatted: string;
  /** Current annual bonus rate, in basis points. */
  bonusAprBps: bigint;
  tx: TxState;
  onApprove: (amount: bigint) => Promise<boolean>;
  onFund: (amountText: string) => Promise<boolean>;
}

/**
 * Anyone can top up the time-bonus pool (Incentive 2 - see SavingsJar.sol).
 * This funds the *other* incentive to the reward share: unlike the reward
 * pool, the bonus pool is not self-funding, so it needs real USDC behind it
 * or it simply pays 0 (the contract caps every bonus at what's left in the
 * pool, so it can never go insolvent over this - it just runs dry).
 *
 * Same two-step approve-then-call flow as <CreateJarForm />: approve is
 * skipped automatically once the wallet's allowance already covers the
 * amount typed in.
 */
export default function FundBonusPoolCard({
  usdcBalance,
  allowance,
  bonusPoolBalanceFormatted,
  bonusAprBps,
  tx,
  onApprove,
  onFund,
}: FundBonusPoolCardProps) {
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  /* ------------------------------ derived --------------------------------- */

  const amount = useMemo(() => {
    try {
      return parseUsdc(amountInput || "0");
    } catch {
      return 0n;
    }
  }, [amountInput]);

  const canSubmitAmount = amount > 0n && amount <= usdcBalance;
  const allowanceCoversAmount = canSubmitAmount && allowance >= amount;

  const balanceExceeded = amount > 0n && amount > usdcBalance;

  const busy = tx.stage === "approving" || tx.stage === "funding";

  const badgeStatus: BadgeStatus =
    tx.stage === "error"
      ? "error"
      : busy
        ? "loading"
        : tx.stage === "approved" || tx.stage === "funded"
          ? "success"
          : "idle";

  const badgeLabel =
    tx.stage === "error"
      ? (tx.error ?? "Something went wrong")
      : busy || tx.stage === "approved" || tx.stage === "funded"
        ? tx.message
        : "";

  /* ------------------------------ actions --------------------------------- */

  const handleApprove = useCallback(async () => {
    if (!canSubmitAmount) return;
    console.log("[FundBonusPoolCard] approve requested for", amount.toString(), "raw USDC units");
    await onApprove(amount);
  }, [amount, canSubmitAmount, onApprove]);

  const handleFund = useCallback(async () => {
    if (!canSubmitAmount || !allowanceCoversAmount) return;
    console.log("[FundBonusPoolCard] fundBonusPool requested", { amount: amountInput });
    const ok = await onFund(amountInput.trim());
    if (ok) setAmountInput("");
  }, [allowanceCoversAmount, amountInput, canSubmitAmount, onFund]);

  /* --------------------------------------------------------------------- */

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          console.log("[FundBonusPoolCard] opened");
          setOpen(true);
        }}
        className="w-full rounded-xl border border-dashed border-navy-500 px-4 py-2.5 text-left text-sm text-muted transition hover:border-gold/40 hover:text-gold"
      >
        + Fund the bonus pool
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-navy-500 bg-navy-800/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Fund the bonus pool</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-xs text-muted hover:text-white"
        >
          ✕
        </button>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        Unlike the reward share (funded automatically by early-break penalties), the{" "}
        {(Number(bonusAprBps) / 100).toFixed(2)}%/year time bonus is only paid from what's in
        this pool - currently <span className="font-mono text-gold">{bonusPoolBalanceFormatted} USDC</span>.
        Anyone can top it up; there's no minimum.
      </p>

      <div className="mt-3">
        <label htmlFor="bonus-pool-amount" className="sr-only">
          Amount to add
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-navy-500 bg-navy-900/60 px-3 py-2">
          <input
            id="bonus-pool-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            disabled={busy}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-muted/60"
          />
          <span className="shrink-0 text-xs text-muted">USDC</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>
            Balance: <span className="font-mono">{formatUsdc(usdcBalance)}</span>
          </span>
          <button
            type="button"
            className="link-chip"
            onClick={() => {
              const raw = usdcBalance.toString().padStart(USDC_DECIMALS + 1, "0");
              const whole = raw.slice(0, -USDC_DECIMALS) || "0";
              const frac = raw.slice(-USDC_DECIMALS);
              setAmountInput(`${whole}.${frac}`);
            }}
            disabled={usdcBalance === 0n || busy}
          >
            Max
          </button>
        </div>
        {balanceExceeded ? (
          <p className="mt-1 text-[11px] text-red-400">Amount exceeds your USDC balance.</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {allowanceCoversAmount ? (
          <button
            type="button"
            onClick={handleFund}
            disabled={!canSubmitAmount || busy}
            className="btn-primary w-full justify-center"
          >
            {tx.stage === "funding" ? "Funding..." : "Add to bonus pool"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleApprove}
            disabled={!canSubmitAmount || busy}
            className="btn-primary w-full justify-center"
          >
            {tx.stage === "approving" ? "Approving..." : "Approve USDC"}
          </button>
        )}

        {badgeLabel ? <StatusBadge status={badgeStatus} label={badgeLabel} /> : null}
      </div>
    </div>
  );
}
