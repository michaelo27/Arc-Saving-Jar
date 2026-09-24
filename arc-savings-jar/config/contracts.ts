import { isAddress } from "viem";

import { savingsJarAbi } from "./abi/savingsJar.abi";
import { erc20Abi } from "./abi/erc20.abi";

/**
 * ============================================================================
 *  SINGLE SOURCE OF TRUTH FOR ALL CONTRACT ADDRESSES
 * ============================================================================
 *  Everything the front-end needs to talk to Arc lives in this one file.
 *  Deploy SavingsJar.sol, then paste the address into SAVINGS_JAR_ADDRESS
 *  (or set NEXT_PUBLIC_SAVINGS_JAR_ADDRESS in .env.local). Nothing else in the
 *  codebase needs to change.
 */

// ---------------------------------------------------------------------------
// Chain selection: Arc Mainnet (5042) by default, Arc Testnet (5042002) opt-in
// ---------------------------------------------------------------------------
export type TargetNetwork = "mainnet" | "testnet";

export const TARGET_NETWORK: TargetNetwork =
  (process.env.NEXT_PUBLIC_TARGET_NETWORK as TargetNetwork | undefined) ===
  "testnet"
    ? "testnet"
    : "mainnet";

// ---------------------------------------------------------------------------
// SavingsJar.sol  <-- PASTE YOUR DEPLOYED ADDRESS HERE (mainnet)
// ---------------------------------------------------------------------------
const SAVINGS_JAR_ADDRESS_MAINNET =
  "0x0000000000000000000000000000000000000000";
const SAVINGS_JAR_ADDRESS_TESTNET =
  "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Native USDC (Circle-issued, 6 decimals)
//   Arc Mainnet : 0x3600000000000000000000000000000000000000  (verified on-chain)
//   Arc Testnet : 0x3600000000000000000000000000000000000000  (same address)
// ---------------------------------------------------------------------------
const USDC_ADDRESS_MAINNET = "0x3600000000000000000000000000000000000000";
const USDC_ADDRESS_TESTNET = "0x3600000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Block explorers
// ---------------------------------------------------------------------------
export const EXPLORER_URL_MAINNET = "https://explorer.arc.io";
export const EXPLORER_URL_TESTNET = "https://explorer.testnet.arc.io";

function pick(mainnet: string, testnet: string): string {
  return TARGET_NETWORK === "testnet" ? testnet : mainnet;
}

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

/** SavingsJar.sol deployment address for the selected network. */
const ENV_JAR_ADDRESS = process.env.NEXT_PUBLIC_SAVINGS_JAR_ADDRESS?.trim();
export const SAVINGS_JAR_ADDRESS = (
  ENV_JAR_ADDRESS
    ? ENV_JAR_ADDRESS
    : pick(SAVINGS_JAR_ADDRESS_MAINNET, SAVINGS_JAR_ADDRESS_TESTNET)
) as `0x${string}`;
/** USDC ERC-20 address for the selected network. */
export const USDC_ADDRESS = readEnv(
  "NEXT_PUBLIC_USDC_ADDRESS",
  pick(USDC_ADDRESS_MAINNET, USDC_ADDRESS_TESTNET),
) as `0x${string}`;

export const EXPLORER_URL = pick(EXPLORER_URL_MAINNET, EXPLORER_URL_TESTNET);

/**
 * `true` once a real SavingsJar address has been pasted in.
 * The UI uses this to render a "deploy the contract first" notice instead of
 * throwing a confusing RPC error at the user.
 */
export const IS_CONTRACT_DEPLOYED: boolean =
  isAddress(SAVINGS_JAR_ADDRESS) &&
  SAVINGS_JAR_ADDRESS !== "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Token metadata
// ---------------------------------------------------------------------------
/** USDC uses 6 decimals on Arc. Never hardcode 18 for token math. */
export const USDC_DECIMALS = 6;
export const USDC_SYMBOL = "USDC";
export const USDC_NAME = "USD Coin";

// ---------------------------------------------------------------------------
// Contract limits (mirrored from SavingsJar.sol)
// ---------------------------------------------------------------------------
export const MIN_LOCK_SECONDS = 60; //1hr //86_400; // 24 hours
export const MAX_LOCK_SECONDS = 31_536_000; // 365 days
/** 10% early-exit penalty. Kept in sync with PENALTY_DENOMINATOR in Solidity. */
export const PENALTY_DENOMINATOR = 10;

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------
export { savingsJarAbi, erc20Abi };

export type { SavingsJarAbi } from "./abi/savingsJar.abi";
