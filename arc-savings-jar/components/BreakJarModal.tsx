"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import StatusBadge from "@/components/StatusBadge";
import { formatUsd, penaltyOf, returnedAfterPenalty } from "@/lib/format";
import type { TxState } from "@/lib/types";

export interface BreakJarModalProps {
  open: boolean;
  /** Deposited amount in raw USDC units (6 decimals). */
  amount: bigint;
  jarName: string;
  onCancel: () => void;
  /** Called once the user has typed the confirmation phrase and clicked through. */
  onConfirm: () => void;
  /** Disables both buttons while the break transaction is in flight. */
  busy?: boolean;
  /** Live transaction state, rendered inside the modal so the user sees progress. */
  tx?: TxState;
}

const CONFIRM_WORD = "BREAK";

/**
 * Irreversible-action confirmation for `breakJar()`.
 *
 * The penalty maths mirrors the contract exactly:
 *   penalty  = amount / 10        (integer division, 10%)
 *   returned = amount - penalty
 *
 * Beyond the [Cancel] / [Yes, Break My Jar] buttons from the spec, the user has
 * to type BREAK first - breaking a jar destroys a savings goal and cannot be
 * undone, so a little friction is a feature.
 */
export default function BreakJarModal({
  open,
  amount,
  jarName,
  onCancel,
  onConfirm,
  busy = false,
  tx,
}: BreakJarModalProps) {
  const [typed, setTyped] = useState("");
  const [mounted, setMounted] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  // Reset the typed phrase every time the modal is opened.
  useEffect(() => {
    if (open) {
      setTyped("");
      console.log("[BreakJarModal] opened for jar:", jarName || "(unnamed)");
    }
  }, [open, jarName]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    },
    [busy, onCancel],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (open && mounted) confirmRef.current?.focus();
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const penalty = penaltyOf(amount);
  const returned = returnedAfterPenalty(amount);
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const badgeStatus = tx
    ? tx.stage === "error"
      ? "error"
      : tx.stage === "broken"
        ? "success"
        : tx.stage === "breaking"
          ? "loading"
          : "idle"
    : "idle";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-navy-900/80 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md animate-fade-up rounded-2xl border border-gold/35 bg-navy-700 p-6 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg">
            ⚠️
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">
              Break “{jarName || "your jar"}”?
            </h2>
            <p className="mt-1 text-sm text-muted">This cannot be undone.</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Are you sure? Breaking your jar early means you will lose{" "}
          <span className="font-semibold text-gold">10% ({formatUsd(penalty)} USDC)</span> as a
          penalty fee. You will receive{" "}
          <span className="font-semibold text-white">{formatUsd(returned)} USDC</span> back.
        </p>

        <dl className="mt-5 space-y-2 rounded-2xl border border-navy-500 bg-navy-800/60 p-4 text-sm">
          <Row label="Deposit" value={formatUsd(amount)} />
          <Row label="Discipline fee (10%)" value={`- ${formatUsd(penalty)}`} tone="gold" />
          <div className="border-t border-navy-500 pt-2">
            <Row label="You receive" value={formatUsd(returned)} tone="accent" strong />
          </div>
        </dl>

        <label className="mt-5 block text-xs font-medium uppercase tracking-[0.14em] text-muted">
          Type <span className="font-mono text-gold">{CONFIRM_WORD}</span> to continue
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-navy-500 bg-navy-900 px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-white placeholder:text-muted/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/50"
          />
        </label>

        {tx?.error ? (
          <p className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {tx.error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <StatusBadge status={badgeStatus} label={tx?.message || undefined} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-xl border border-navy-500 px-4 py-2.5 text-sm font-medium text-muted transition hover:border-muted/50 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={busy || !confirmed}
              className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Breaking..." : "Yes, Break My Jar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  label,
  value,
  tone = "default",
  strong = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "gold" | "accent";
  strong?: boolean;
}) {
  const toneClass =
    tone === "gold" ? "text-gold" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`${toneClass} ${strong ? "text-base font-semibold" : "font-medium"} tabular-nums`}>
        {value}
      </dd>
    </div>
  );
}

export { BreakJarModal };
