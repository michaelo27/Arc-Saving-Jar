"use client";

import { useCallback, useMemo, useState } from "react";
import { formatUnits } from "viem";

import StatusBadge from "@/components/StatusBadge";
import {
  MAX_LOCK_SECONDS,
  MIN_LOCK_SECONDS,
  USDC_DECIMALS,
} from "@/config/contracts";
import { parseUsdc } from "@/hooks/useSavingsJar";
import {
  formatDate,
  formatDuration,
  formatDurationApprox,
  formatUsdFromNumber,
} from "@/lib/format";
import type { BadgeStatus, TxState } from "@/lib/types";

export interface CreateJarFormProps {
  /** Wallet USDC balance, raw units (6 decimals). */
  usdcBalance: bigint;
  /** Allowance already granted to SavingsJar, raw units. */
  allowance: bigint;
  /** Native balance - on Arc this is USDC and it pays for gas. */
  gasBalanceFormatted: string;
  tx: TxState;
  onApprove: (amount: bigint) => Promise<boolean>;
  onCreateJar: (input: {
    amount: string;
    durationSeconds: number;
    name: string;
  }) => Promise<boolean>;
}

/** Preset chips from the spec. Values are exact seconds. */
const PRESETS: readonly { label: string; seconds: number }[] = [
  { label: "1 Min", seconds: 60 }, // TESTING ONLY
  { label: "1 Week", seconds: 604_800 },
  { label: "1 Month", seconds: 2_592_000 },
  { label: "3 Months", seconds: 7_776_000 },
  { label: "6 Months", seconds: 15_552_000 },
  { label: "1 Year", seconds: 31_536_000 },
];

const SLIDER_STEPS = 1_000;
const LOG_MIN = Math.log(MIN_LOCK_SECONDS);
const LOG_SPAN = Math.log(MAX_LOCK_SECONDS) - LOG_MIN;

/**
 * The slider is logarithmic: without it, "1 week" and "1 month" would occupy a
 * sliver of the track and every position past the middle would be "a year".
 */
function secondsToSlider(seconds: number): number {
  const clamped = Math.min(
    MAX_LOCK_SECONDS,
    Math.max(MIN_LOCK_SECONDS, seconds),
  );
  return Math.round(((Math.log(clamped) - LOG_MIN) / LOG_SPAN) * SLIDER_STEPS);
}

function sliderToSeconds(step: number): number {
  const bounded = Math.min(SLIDER_STEPS, Math.max(0, step));
  return Math.round(Math.exp(LOG_MIN + (bounded / SLIDER_STEPS) * LOG_SPAN));
}

/** Snap a raw duration to whole days so the label never reads "29.9 days". */
// function snapToDays(seconds: number): number {
//   const days = Math.max(1, Math.round(seconds / 86_400));
//   return Math.min(MAX_LOCK_SECONDS, days * 86_400);
// }
function snapToDays(seconds: number): number {
  if (seconds < 86_400) return Math.max(MIN_LOCK_SECONDS, Math.round(seconds));
  const days = Math.round(seconds / 86_400);
  return Math.min(MAX_LOCK_SECONDS, days * 86_400);
}

const DEFAULT_DURATION = 2_592_000; // 30 days

/**
 * STATE 2 of the app: the create-jar form.
 *
 * Two-step flow, exactly as specified:
 *   1. "Approve USDC"  -> ERC-20 approve(spender = SavingsJar, value = amount)
 *   2. "Create Jar 🫙" -> SavingsJar.createJar(amount, duration, name)
 *
 * Step 1 is skipped automatically when the existing allowance already covers
 * the amount the user typed.
 */
export default function CreateJarForm({
  usdcBalance,
  allowance,
  gasBalanceFormatted,
  tx,
  onApprove,
  onCreateJar,
}: CreateJarFormProps) {
  const [jarName, setJarName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_DURATION);

  /* ------------------------------ parsing -------------------------------- */

  const parsedAmount = useMemo<{
    value: bigint | null;
    error: string | null;
  }>(() => {
    if (amountInput.trim().length === 0) return { value: null, error: null };
    try {
      return { value: parseUsdc(amountInput), error: null };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Invalid amount",
      };
    }
  }, [amountInput]);

  const amount = parsedAmount.value ?? 0n;
  const balanceNumber = Number(formatUnits(usdcBalance, USDC_DECIMALS));

  /* ---------------------------- validation ------------------------------- */

  const nameTrimmed = jarName.trim();
  const nameError =
    nameTrimmed.length === 0
      ? null
      : nameTrimmed.length > 48
        ? "Keep it under 48 characters"
        : null;

  const amountError =
    parsedAmount.error ??
    (amount > 0n && amount > usdcBalance
      ? `Insufficient balance - you have ${formatUsdFromNumber(balanceNumber)} USDC`
      : null);

  const hasAmount = amount > 0n;
  const canSubmitAmount = hasAmount && !amountError;
  const canSubmitName = nameTrimmed.length > 0 && !nameError;
  const allowanceCoversAmount = canSubmitAmount && allowance >= amount;

  const formValid = canSubmitAmount && canSubmitName;

  /* ------------------------------ status --------------------------------- */

  const busy = tx.stage === "approving" || tx.stage === "creating";

  const badgeStatus: BadgeStatus =
    tx.stage === "error"
      ? "error"
      : busy
        ? "loading"
        : tx.stage === "approved" || tx.stage === "created"
          ? "success"
          : "idle";

  const badgeLabel =
    tx.stage === "error"
      ? (tx.error ?? "Something went wrong")
      : busy || tx.stage === "approved" || tx.stage === "created"
        ? tx.message
        : "";

  /* ------------------------------ actions -------------------------------- */

  const handleApprove = useCallback(async () => {
    if (!canSubmitAmount) return;
    console.log(
      "[CreateJarForm] approve requested for",
      amount.toString(),
      "raw USDC units",
    );
    await onApprove(amount);
  }, [amount, canSubmitAmount, onApprove]);

  const handleCreate = useCallback(async () => {
    if (!formValid || !allowanceCoversAmount) return;
    console.log("[CreateJarForm] createJar requested", {
      amount: amountInput,
      durationSeconds,
      name: nameTrimmed,
    });
    await onCreateJar({
      amount: amountInput.trim(),
      durationSeconds,
      name: nameTrimmed,
    });
  }, [
    allowanceCoversAmount,
    amountInput,
    durationSeconds,
    formValid,
    nameTrimmed,
    onCreateJar,
  ]);

  const setPreset = useCallback((seconds: number) => {
    setDurationSeconds(seconds);
    console.log("[CreateJarForm] preset selected:", formatDuration(seconds));
  }, []);

  const handleSlider = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDurationSeconds(
        snapToDays(sliderToSeconds(Number(event.target.value))),
      );
    },
    [],
  );

  const fillPercentage = (value: number) => {
    if (balanceNumber <= 0) return;
    setAmountInput(
      (Number(formatUnits(usdcBalance, USDC_DECIMALS)) * value).toFixed(2),
    );
  };

  const sliderPosition = secondsToSlider(durationSeconds);
  const unlockDate = new Date(Date.now() + durationSeconds * 1_000);

  /* -------------------------------- render ------------------------------- */

  return (
    <section className="w-full max-w-2xl animate-fade-up rounded-2xl border border-navy-500 bg-navy-700/60 p-6 shadow-card sm:p-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">
          Create Your Savings Jar
        </h2>
        <p className="mt-1 text-sm text-muted">
          Name it, fund it, lock it. The contract will not let you touch it
          until the date you pick.
        </p>
      </header>

      <div className="space-y-6">
        {/* -------------------------------------------------------- jar name */}
        <Field
          label="Jar Name"
          hint={`${nameTrimmed.length}/48 - stored on-chain`}
          error={nameError}>
          <input
            value={jarName}
            onChange={(event) => setJarName(event.target.value.slice(0, 60))}
            placeholder="e.g., My Vacation Fund"
            maxLength={60}
            className="input"
            aria-invalid={Boolean(nameError)}
          />
        </Field>

        {/* ----------------------------------------------------------- amount */}
        <Field
          label="USDC Amount"
          hint={
            <span className="inline-flex items-center gap-2">
              Balance:{" "}
              <span className="font-mono text-white">
                {formatUsdFromNumber(balanceNumber)} USDC
              </span>
              {balanceNumber > 0 ? (
                <>
                  <button
                    type="button"
                    className="link-chip"
                    onClick={() => fillPercentage(0.25)}>
                    25%
                  </button>
                  <button
                    type="button"
                    className="link-chip"
                    onClick={() => fillPercentage(0.5)}>
                    50%
                  </button>
                  <button
                    type="button"
                    className="link-chip"
                    onClick={() => fillPercentage(1)}>
                    MAX
                  </button>
                </>
              ) : null}
            </span>
          }
          error={amountError}>
          <div className="relative">
            <input
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              min={1}
              className="input pr-20 font-mono"
              aria-invalid={Boolean(amountError)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-muted">
              USDC
            </span>
          </div>
        </Field>

        {/* --------------------------------------------------------- duration */}
        <Field label="Lock Duration" hint={`Min 24 hours · Max 365 days`}>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = durationSeconds === preset.seconds;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPreset(preset.seconds)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-navy-500 bg-navy-800/60 text-muted hover:border-accent/40 hover:text-white"
                  }`}
                  aria-pressed={active}>
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              step={1}
              value={sliderPosition}
              onChange={handleSlider}
              className="jar-slider"
              aria-label="Lock duration in days"
              aria-valuetext={`${formatDuration(durationSeconds)}, unlocks ${formatDate(
                Math.floor(unlockDate.getTime() / 1000),
              )}`}
              style={
                {
                  "--slider-fill": `${(sliderPosition / SLIDER_STEPS) * 100}%`,
                } as React.CSSProperties
              }
            />
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted/70">
              <span>1 day</span>
              <span>1 mo</span>
              <span>3 mo</span>
              <span>6 mo</span>
              <span>1 yr</span>
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm text-white">
            Your jar locks for{" "}
            <span className="font-semibold text-accent">
              {formatDurationApprox(durationSeconds)}
            </span>
            .{" "}
            <span className="text-muted">
              Unlocks on:{" "}
              <span className="font-medium text-white">
                {formatDate(Math.floor(unlockDate.getTime() / 1000))}
              </span>
            </span>
          </p>
        </Field>

        {/* ---------------------------------------------------------- warning */}
        <div className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          ⚠️ Early withdrawal carries a{" "}
          <span className="font-semibold">10% penalty</span>. Only break your
          jar in a true emergency. The fee stays in the contract as a discipline
          fee.
        </div>

        {/* ---------------------------------------------------------- actions */}
        <div className="space-y-3">
          {allowanceCoversAmount ? (
            <p className="flex items-center gap-2 text-xs text-emerald-300">
              <CheckIcon /> Allowance already covers this amount - no approval
              needed.
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleApprove}
              disabled={!canSubmitAmount || allowanceCoversAmount || busy}
              className="btn-secondary flex-1">
              {tx.stage === "approving" ? (
                <>
                  <Spinner /> Approving...
                </>
              ) : tx.stage === "approved" || allowanceCoversAmount ? (
                <>
                  <CheckIcon /> Approved ✓
                </>
              ) : (
                "1. Approve USDC"
              )}
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={!formValid || !allowanceCoversAmount || busy}
              className="btn-primary flex-1">
              {tx.stage === "creating" ? (
                <>
                  <Spinner /> Creating Jar...
                </>
              ) : tx.stage === "created" ? (
                <>
                  <CheckIcon /> Jar Created! ✓
                </>
              ) : (
                "2. Create Jar 🫙"
              )}
            </button>
          </div>

          {!allowanceCoversAmount && canSubmitAmount ? (
            <p className="text-xs text-muted">
              Step 2 unlocks after your approval is confirmed on-chain.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <StatusBadge status={badgeStatus} label={badgeLabel || undefined} />
            <p className="text-xs text-muted">
              Gas on Arc is paid in USDC · your gas balance:{" "}
              <span className="font-mono text-white">
                {gasBalanceFormatted}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Presentational helpers                                                    */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-white">{label}</label>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export { CreateJarForm };
