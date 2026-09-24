"use client";

import type { BadgeStatus } from "@/lib/types";

export interface StatusBadgeProps {
  /** Which visual state to render. */
  status: BadgeStatus;
  /** Text shown next to the icon. Falls back to the status name. */
  label?: string;
  /** Render nothing at all when `status === "idle"` and no label is given. */
  hideWhenIdle?: boolean;
  className?: string;
}

const FALLBACK_LABEL: Record<BadgeStatus, string> = {
  idle: "Ready",
  loading: "Waiting for your wallet...",
  success: "Confirmed",
  error: "Failed",
};

const TONE: Record<BadgeStatus, string> = {
  idle: "border-navy-500 bg-navy-700/50 text-muted",
  loading: "border-accent/40 bg-accent/10 text-accent",
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  error: "border-red-400/40 bg-red-500/10 text-red-300",
};

/**
 * Small pill that communicates the state of a transaction:
 * idle / loading (spinner) / success (check) / error (cross).
 */
export default function StatusBadge({
  status,
  label,
  hideWhenIdle = true,
  className = "",
}: StatusBadgeProps) {
  if (status === "idle" && hideWhenIdle && !label) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${TONE[status]} ${className}`}
    >
      <BadgeIcon status={status} />
      <span className="truncate">{label ?? FALLBACK_LABEL[status]}</span>
    </span>
  );
}

function BadgeIcon({ status }: { status: BadgeStatus }) {
  if (status === "loading") {
    return (
      <svg
        className="h-3.5 w-3.5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
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

  if (status === "success") {
    return (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }

  return <span className="h-2 w-2 rounded-full bg-current opacity-60" aria-hidden="true" />;
}

export { StatusBadge };
