"use client";

import { useCountdown } from "@/hooks/useCountdown";

export interface CountdownTimerProps {
  /** Unix timestamp in **seconds** - exactly what `JarData.unlockTime` holds. */
  unlockTimestamp: number | bigint;
  /** Optional heading rendered above the boxes. */
  title?: string;
  /** Tighter layout for sidebars / modals. */
  compact?: boolean;
  className?: string;
}

const UNITS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
] as const;

/**
 * Live countdown to the unlock timestamp. Ticks once per second (see
 * `hooks/useCountdown`) and clamps at zero, so it never renders negatives.
 */
export default function CountdownTimer({
  unlockTimestamp,
  title = "Time remaining",
  compact = false,
  className = "",
}: CountdownTimerProps) {
  const { parts, isExpired } = useCountdown(unlockTimestamp);

  if (isExpired) {
    return (
      <div
        className={`rounded-2xl border border-gold/40 bg-gold/10 px-5 py-4 text-center ${className}`}
      >
        <p className="text-sm font-semibold text-gold">Lock expired - your jar is unlocked</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-muted">
          {title}
        </p>
      ) : null}

      <div
        className={`grid grid-cols-4 items-stretch ${
          compact ? "gap-1.5" : "gap-2 sm:gap-3"
        }`}
        aria-label={`Time remaining: ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`}
      >
        {UNITS.map((unit, index) => (
          <div key={unit.key} className="flex items-stretch gap-2 sm:gap-3">
            <div
              className={`flex-1 rounded-2xl border border-navy-500 bg-navy-700/70 text-center shadow-card ${
                compact ? "px-1 py-2" : "px-2 py-3 sm:py-4"
              }`}
            >
              <div
                className={`font-mono font-semibold tabular-nums text-white ${
                  compact ? "text-lg" : "text-2xl sm:text-3xl"
                }`}
              >
                {parts[unit.key]}
              </div>
              <div
                className={`mt-0.5 uppercase tracking-[0.14em] text-muted ${
                  compact ? "text-[9px]" : "text-[10px] sm:text-xs"
                }`}
              >
                {unit.label}
              </div>
            </div>
            {index < UNITS.length - 1 ? (
              <span
                aria-hidden="true"
                className={`self-center font-mono text-accent/50 ${
                  compact ? "text-sm" : "text-xl"
                }`}
              >
                :
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export { CountdownTimer };
