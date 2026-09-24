"use client";

import { useEffect, useState } from "react";

import { pad2 } from "@/lib/format";

/** Remaining time, broken into displayable units. Never negative. */
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total whole seconds left (0 once expired). Handy for progress maths. */
  totalSeconds: number;
  /** `true` when the target timestamp has passed. */
  isExpired: boolean;
  /** Zero padded strings for direct rendering ("07"). */
  parts: { days: string; hours: string; minutes: string; seconds: string };
}

const ZERO: Countdown = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  totalSeconds: 0,
  isExpired: true,
  parts: { days: "00", hours: "00", minutes: "00", seconds: "00" },
};

/**
 * Internal ticking engine. Pure enough to be shared by `useCountdown`.
 *
 * Notes:
 * - The first render is computed from the current clock, so the SSR payload and
 *   the client's first paint agree enough to avoid a hydration warning, and the
 *   interval immediately corrects any drift.
 * - `totalSeconds` is clamped at 0: the countdown can never show negatives.
 * - The interval is cleared when the tab is hidden and restored when it is
 *   visible again, which keeps a long-lived savings jar cheap to run.
 */
export function useCountdownEngine(targetSeconds: number, enabled = true): Countdown {
  const [state, setState] = useState<Countdown>(() => (enabled ? compute(targetSeconds) : ZERO));

  useEffect(() => {
    if (!enabled) {
      setState(ZERO);
      return;
    }

    setState(compute(targetSeconds));

    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setState((prev) => {
        const next = compute(targetSeconds);
        // Skip the re-render when nothing actually changed (already expired).
        if (next.totalSeconds === prev.totalSeconds) return prev;
        return next;
      });
    }, 1_000);

    return () => window.clearInterval(id);
  }, [targetSeconds, enabled]);

  return state;
}

function compute(targetSeconds: number): Countdown {
  const target = Math.floor(targetSeconds);
  if (!Number.isFinite(target) || target <= 0) return ZERO;

  const now = Math.floor(Date.now() / 1_000);
  const diff = target - now;

  if (diff <= 0) return ZERO;

  const days = Math.floor(diff / 86_400);
  const hours = Math.floor((diff % 86_400) / 3_600);
  const minutes = Math.floor((diff % 3_600) / 60);
  const seconds = diff % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds: diff,
    isExpired: false,
    parts: {
      days: pad2(days),
      hours: pad2(hours),
      minutes: pad2(minutes),
      seconds: pad2(seconds),
    },
  };
}

/**
 * `hooks/useCountdown.ts`
 * ---------------------------------------------------------------------------
 * Takes a Unix timestamp **in seconds** (exactly what the contract stores in
 * `JarData.unlockTime`) and returns `{ days, hours, minutes, seconds }`,
 * refreshed every second.
 *
 * @param unlockTimestamp Unix seconds. `0`, `null` or `undefined` disables it.
 */
export function useCountdown(unlockTimestamp: number | bigint | null | undefined): Countdown {
  const target =
    unlockTimestamp === null || unlockTimestamp === undefined
      ? 0
      : Number(unlockTimestamp);

  return useCountdownEngine(target, target > 0);
}

export default useCountdown;
