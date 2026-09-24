/**
 * scripts/deploy.mjs
 * ---------------------------------------------------------------------------
 * Deploys SavingsJar.sol to Arc using nothing but viem - no Hardhat, no
 * Foundry, no extra toolchain.
 *
 *   npm run compile                 # regenerate artifacts/SavingsJar.json
 *   PRIVATE_KEY=0x... npm run deploy:testnet
 *   PRIVATE_KEY=0x... npm run deploy:mainnet
 *
 * Environment:
 *   PRIVATE_KEY   required - deployer key. On Arc this account needs a little
 *                          native USDC for gas (fees are ~0.002 USDC).
 *   ARC_RPC_URL   optional - overrides the built-in public RPC.
 *   USDC_ADDRESS  optional - overrides the USDC address for the target network.
 *
 * Flags:
 *   --testnet | --mainnet    (default: --testnet, so you cannot fat-finger mainnet)
 *   --dry-run                simulate only, do not broadcast
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, http, isAddress, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ----------------------------- network table ----------------------------- */

const NETWORKS = {
  mainnet: {
    id: 5042,
    name: "Arc Mainnet",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    // Native USDC on Arc Mainnet (verified on-chain: symbol USDC, decimals 6).
    usdc: "0x3600000000000000000000000000000000000000",
  },
  testnet: {
    id: 5042002,
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    usdc: "0x3600000000000000000000000000000000000000",
  },
};

/* --------------------------------- setup ---------------------------------- */

function parseArgs(argv) {
  const flags = { network: "testnet", dryRun: false };
  for (const arg of argv) {
    if (arg === "--mainnet") flags.network = "mainnet";
    else if (arg === "--testnet") flags.network = "testnet";
    else if (arg === "--dry-run") flags.dryRun = true;
  }
  return flags;
}

function fail(message) {
  console.error(`\n\u001b[31m✗ ${message}\u001b[0m\n`);
  process.exit(1);
}

const { network: networkKey, dryRun } = parseArgs(process.argv.slice(2));
const network = NETWORKS[networkKey];
if (!network) fail(`Unknown network "${networkKey}". Use --mainnet or --testnet.`);

const artifactPath = resolve(ROOT, "artifacts/SavingsJar.json");
if (!existsSync(artifactPath)) {
  fail("artifacts/SavingsJar.json not found. Run `npm run compile` first.");
}
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

const rpcUrl = process.env.ARC_RPC_URL || network.rpc;
const usdcAddress = process.env.USDC_ADDRESS || network.usdc;

if (!isAddress(usdcAddress)) fail(`USDC address is not valid: ${usdcAddress}`);

console.log(`\n\u001b[1mArc Savings Jar - deployment\u001b[0m`);
console.log(`  network  ${network.name} (chainId ${network.id})`);
console.log(`  rpc      ${rpcUrl}`);
console.log(`  USDC     ${usdcAddress}`);
console.log(`  bytecode ${artifact.bytecode.length / 2 - 1} bytes`);
if (dryRun) console.log(`  mode     DRY RUN (nothing will be broadcast)`);

const publicClient = createPublicClient({ transport: http(rpcUrl) });

/* --------------------------- pre-flight checks ---------------------------- */

const chainId = await publicClient.getChainId();
if (chainId !== network.id) {
  fail(`RPC answered chainId ${chainId}, expected ${network.id}. Check ARC_RPC_URL.`);
}
console.log(`  ✓ RPC is live and on chainId ${chainId}`);

// Confirm the USDC address really is a 6-decimal USDC before wiring it in.
const symbol = await publicClient.readContract({
  address: usdcAddress,
  abi: [{ type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }],
  functionName: "symbol",
});
const decimals = await publicClient.readContract({
  address: usdcAddress,
  abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
  functionName: "decimals",
});
if (decimals !== 6) {
  fail(`USDC at ${usdcAddress} reports ${decimals} decimals - the app assumes 6. Aborting.`);
}
console.log(`  ✓ USDC verified: symbol="${symbol}", decimals=${decimals}`);

if (dryRun) {
  console.log("\n\u001b[33mDry run complete - no transaction was sent.\u001b[0m\n");
  process.exit(0);
}

/* -------------------------------- deploy ---------------------------------- */

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  fail("PRIVATE_KEY is not set. Export it before deploying:\n    PRIVATE_KEY=0x... npm run deploy:testnet");
}

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
console.log(`  deployer ${account.address}`);

const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

const nativeBalance = await publicClient.getBalance({ address: account.address });
console.log(`  gas      ${formatUnits(nativeBalance, 18)} native USDC available`);
if (nativeBalance === 0n) {
  fail(
    `Deployer ${account.address} has no native balance. On Arc, gas is paid in USDC - ` +
      (networkKey === "testnet"
        ? "get some from https://faucet.circle.com"
        : "fund it before deploying."),
  );
}

console.log("\n  broadcasting deployment...");
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [usdcAddress],
});
console.log(`  tx ${hash}`);
console.log(`  ${network.explorer}/tx/${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
if (receipt.status !== "success") fail(`Deployment reverted. See ${network.explorer}/tx/${hash}`);

const address = receipt.contractAddress;
if (!address) fail("Receipt contained no contract address.");

/* ------------------------------ report ------------------------------------ */

console.log(`\n\u001b[32m✓ SavingsJar deployed\u001b[0m`);
console.log(`  contract  ${address}`);
console.log(`  owner     ${account.address}`);
console.log(`  block     ${receipt.blockNumber}`);
console.log(`  gas used  ${receipt.gasUsed.toString()}`);
console.log(`  explorer  ${network.explorer}/address/${address}`);

console.log(`\n\u001b[1mNext steps\u001b[0m`);
console.log(`  1. Paste the address into config/contracts.ts:`);
console.log(
  networkKey === "mainnet"
    ? `       const SAVINGS_JAR_ADDRESS_MAINNET = "${address}";`
    : `       const SAVINGS_JAR_ADDRESS_TESTNET = "${address}";`,
);
console.log(`     or set it without touching code:`);
console.log(`       echo 'NEXT_PUBLIC_SAVINGS_JAR_ADDRESS=${address}' >> .env.local`);
console.log(`  2. Sanity check it:  npm run verify -- --network ${networkKey} --jar ${address}`);
console.log(`  3. Verify the source on the explorer so the ABI is public.`);
console.log(`     Compiler: solc 0.8.28, optimizer 200 runs, evmVersion paris.`);
console.log(`     Constructor arg (abi-encoded address): ${usdcAddress.toLowerCase().padStart(64, "0")}\n`);
