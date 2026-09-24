import { formatUnits, type BaseError } from "viem";

import { USDC_DECIMALS, PENALTY_DENOMINATOR } from "../config/contracts";

/* -------------------------------------------------------------------------- */
/*  USDC (6 decimals)                                                         */
/* -------------------------------------------------------------------------- */

/** Raw USDC units -> whole USDC as a JS number. Only use for display. */
export function usdcToNumber(raw: bigint): number {
  return Number(formatUnits(raw, USDC_DECIMALS));
}

/**
 * Raw USDC units -> "$1,234.56". Always exactly two decimals, never NaN.
 * Dollar amounts in this app are 1 USDC == 1 USD, so the prefix is literal.
 */
export function formatUsd(raw: bigint): string {
  return `$${formatAmount(usdcToNumber(raw))}`;
}

/** Whole USDC -> "$1,234.56". */
export function formatUsdFromNumber(value: number): string {
  return `$${formatAmount(value)}`;
}

/** Raw USDC units -> "1,234.56 USDC". */
export function formatUsdc(raw: bigint): string {
  return `${formatAmount(usdcToNumber(raw))} USDC`;
}

/** Plain number -> thousands separated, exactly 2 decimals. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Percentage of a deposit lost to the early-exit penalty.
 * Mirrors `amount / PENALTY_DENOMINATOR` in Solidity (integer division).
 */
export function penaltyOf(amount: bigint): bigint {
  return amount / BigInt(PENALTY_DENOMINATOR);
}

/** What the user actually gets back when breaking a jar early. */
export function returnedAfterPenalty(amount: bigint): bigint {
  return amount - penaltyOf(amount);
}

/* -------------------------------------------------------------------------- */
/*  Addresses                                                                 */
/* -------------------------------------------------------------------------- */

/** 0x1234abcd...ef90 */
export function truncateAddress(address: string | undefined | null): string {
  if (!address) return "";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function explorerAddressUrl(baseUrl: string, address: string): string {
  return `${baseUrl.replace(/\/$/, "")}/address/${address}`;
}

export function explorerTxUrl(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/tx/${hash}`;
}

/* -------------------------------------------------------------------------- */
/*  Durations                                                                 */
/* -------------------------------------------------------------------------- */

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3_600;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_WEEK = 604_800;
export const SECONDS_PER_MONTH = 2_629_800; // average month (30.4375 days)
export const SECONDS_PER_YEAR = 31_536_000; // 365 days

/**
 * Exact, human readable duration. Used for "You saved $X for 3 months".
 * Falls back to days/hours for arbitrary values so it never lies.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));

  if (s === 0) return "0 seconds";
  if (s % SECONDS_PER_YEAR === 0) {
    const years = s / SECONDS_PER_YEAR;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (s % (SECONDS_PER_YEAR / 2) === 0) {
    const halves = s / (SECONDS_PER_YEAR / 2);
    return `${halves} ${halves === 1 ? "month" : "months"}`;
  }
  if (s % (SECONDS_PER_YEAR / 4) === 0) {
    const quarters = s / (SECONDS_PER_YEAR / 4);
    return `${quarters} months`;
  }
  if (s % SECONDS_PER_MONTH === 0) {
    const months = s / SECONDS_PER_MONTH;
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  if (s % SECONDS_PER_WEEK === 0) {
    const weeks = s / SECONDS_PER_WEEK;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  if (s % SECONDS_PER_DAY === 0) {
    const days = s / SECONDS_PER_DAY;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (s % SECONDS_PER_HOUR === 0) {
    const hours = s / SECONDS_PER_HOUR;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const days = Math.floor(s / SECONDS_PER_DAY);
  const hours = Math.floor((s % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Loose, conversational duration: "about 3 months", "about 2 weeks". */
export function formatDurationApprox(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s === 0) return "no time";
  if (s >= SECONDS_PER_YEAR) {
    const years = s / SECONDS_PER_YEAR;
    return `${trimNumber(years)} ${years === 1 ? "year" : "years"}`;
  }
  if (s >= SECONDS_PER_MONTH) {
    const months = s / SECONDS_PER_MONTH;
    return `${trimNumber(months)} ${months === 1 ? "month" : "months"}`;
  }
  if (s >= SECONDS_PER_WEEK) {
    const weeks = s / SECONDS_PER_WEEK;
    return `${trimNumber(weeks)} ${weeks === 1 ? "week" : "weeks"}`;
  }
  if (s >= SECONDS_PER_DAY) {
    const days = s / SECONDS_PER_DAY;
    return `${trimNumber(days)} ${days === 1 ? "day" : "days"}`;
  }
  const hours = Math.max(1, Math.floor(s / SECONDS_PER_HOUR));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

/** "December 14, 2025" */
export function formatDate(timestampSeconds: number | bigint): string {
  const ms = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "December 14, 2025 at 3:42 PM" */
export function formatDateTime(timestampSeconds: number | bigint): string {
  const ms = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Two digit padding for the countdown boxes. */
export function pad2(value: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(2, "0");
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a viem / wagmi error into something a human can act on.
 * Wallet rejections are the common case, so they get friendly copy; contract
 * `require` strings are surfaced verbatim because they are already readable.
 */
export function formatContractError(error: unknown): string {
  if (!error) return "Something went wrong.";

  const err = error as BaseError & { code?: number; cause?: unknown };
  const message = err.shortMessage ?? err.message ?? String(error);

  // User rejected in the wallet.
  if (
    /user rejected|rejected the request|denied transaction|User rejected/i.test(message) ||
    err.code === 4001
  ) {
    return "Transaction rejected in your wallet.";
  }
  if (/insufficient funds|not enough balance|InsufficientFunds/i.test(message)) {
    return "Insufficient balance to cover this transaction.";
  }
  if (/execution reverted/i.test(message)) {
    const reason = /execution reverted:?\s*(.*)$/i.exec(message)?.[1]?.trim();
    return reason ? reason : "Transaction was reverted by the contract.";
  }
  if (/nonce too low|replacement transaction/i.test(message)) {
    return "Nonce conflict - wait for the pending transaction to settle.";
  }
  if (/chain mismatch|invalid chain|unsupported chain/i.test(message)) {
    return "Your wallet is on the wrong network.";
  }
  if (/timeout|failed to fetch|network|rpc/i.test(message)) {
    return "Could not reach the Arc RPC. Check your connection and retry.";
  }

  // Keep it short: wallets sometimes return a wall of JSON.
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}
