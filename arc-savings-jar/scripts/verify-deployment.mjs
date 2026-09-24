/**
 * scripts/verify-deployment.mjs
 * ---------------------------------------------------------------------------
 * Post-deployment smoke test: reads a live SavingsJar deployment and the USDC
 * it points at, and checks that every view function the front-end depends on
 * actually answers. Safe to run against mainnet - it only performs eth_calls.
 *
 *   npm run verify -- --network mainnet --jar 0xYourJar
 *   npm run verify -- --network testnet --jar 0xYourJar --user 0xSomeSaver
 */
import { createPublicClient, http, isAddress, formatUnits } from "viem";

const NETWORKS = {
  mainnet: { id: 5042, name: "Arc Mainnet", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io" },
  testnet: { id: 5042002, name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", explorer: "https://explorer.testnet.arc.io" },
};

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
];

const JAR_ABI = [
  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "MIN_LOCK_DURATION", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_LOCK_DURATION", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalJarsCreated", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalWithdrawn", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalActiveDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getAccumulatedPenalties", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_JARS_PER_WALLET", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getJars",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "tuple[]", components: [
      { name: "amount", type: "uint256" },
      { name: "unlockTime", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "rewardDebt", type: "uint256" },
      { name: "isActive", type: "bool" },
      { name: "jarName", type: "string" },
    ] }],
  },
  { type: "function", name: "getActiveJarCount", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getTimeRemaining", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingReward", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewBonus", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "points", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getTier", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "accRewardPerShare", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rewardPoolBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bonusPoolBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bonusAprBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerFeesAccrued", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalRewardsPaid", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalBonusPaid", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalPointsAwarded", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const networkKey = arg("network") ?? "mainnet";
const network = NETWORKS[networkKey];
if (!network) {
  console.error(`Unknown network "${networkKey}". Use --network mainnet|testnet`);
  process.exit(1);
}

const jarAddress = arg("jar");
if (!jarAddress || !isAddress(jarAddress)) {
  console.error("Pass a deployed contract address:  npm run verify -- --network mainnet --jar 0x...");
  process.exit(1);
}

const userAddress = arg("user");
const rpcUrl = process.env.ARC_RPC_URL || network.rpc;
const client = createPublicClient({ transport: http(rpcUrl) });

const read = (abi, address, functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });

let failures = 0;
function report(label, value, ok = true) {
  console.log(`  ${ok ? "\u001b[32m✓\u001b[0m" : "\u001b[31m✗\u001b[0m"} ${label.padEnd(34)} ${value}`);
  if (!ok) failures += 1;
}

console.log(`\n\u001b[1mVerifying SavingsJar on ${network.name}\u001b[0m`);
console.log(`  rpc       ${rpcUrl}`);
console.log(`  contract  ${jarAddress}`);
console.log(`  explorer  ${network.explorer}/address/${jarAddress}\n`);

const chainId = await client.getChainId();
report("chainId", `${chainId}`, chainId === network.id);

const code = await client.getCode({ address: jarAddress });
report("contract code deployed", code && code.length > 2 ? `${(code.length - 2) / 2} bytes` : "NONE", Boolean(code && code.length > 2));
if (!code || code.length <= 2) {
  console.error("\nNothing deployed at that address - aborting.\n");
  process.exit(1);
}

const usdcAddress = await read(JAR_ABI, jarAddress, "usdc");
const owner = await read(JAR_ABI, jarAddress, "owner");
const minLock = await read(JAR_ABI, jarAddress, "MIN_LOCK_DURATION");
const maxLock = await read(JAR_ABI, jarAddress, "MAX_LOCK_DURATION");
const maxJars = await read(JAR_ABI, jarAddress, "MAX_JARS_PER_WALLET");

report("usdc()", usdcAddress, isAddress(usdcAddress));
report("owner()", owner);
report("MIN_LOCK_DURATION", `${minLock}s (24h)`, minLock === 86_400n);
report("MAX_LOCK_DURATION", `${maxLock}s (365d)`, maxLock === 31_536_000n);
report("MAX_JARS_PER_WALLET", `${maxJars}`, maxJars === 10n);

const symbol = await read(ERC20_ABI, usdcAddress, "symbol");
const decimals = await read(ERC20_ABI, usdcAddress, "decimals");
report("USDC symbol / decimals", `${symbol} / ${decimals}`, symbol === "USDC" && decimals === 6);

const held = await read(ERC20_ABI, usdcAddress, "balanceOf", [jarAddress]);
const active = await read(JAR_ABI, jarAddress, "totalActiveDeposits");
const ownerFees = await read(JAR_ABI, jarAddress, "ownerFeesAccrued");
const rewardPool = await read(JAR_ABI, jarAddress, "rewardPoolBalance");
const bonusPool = await read(JAR_ABI, jarAddress, "bonusPoolBalance");
const bonusApr = await read(JAR_ABI, jarAddress, "bonusAprBps");

report("USDC held by contract", `${formatUnits(held, 6)} USDC`);
report("totalActiveDeposits", `${formatUnits(active, 6)} USDC`, held >= active);
report("ownerFeesAccrued (sweepable)", `${formatUnits(ownerFees, 6)} USDC`);
report("rewardPoolBalance", `${formatUnits(rewardPool, 6)} USDC`);
report("bonusPoolBalance", `${formatUnits(bonusPool, 6)} USDC`);
report("bonusAprBps", `${bonusApr} (${(Number(bonusApr) / 100).toFixed(2)}%/yr)`, bonusApr <= 2_000n);

// The four buckets should account for every USDC sitting in the contract.
// Stray USDC sent directly to the contract (bypassing createJar/breakJar/
// fundBonusPool) would show up here as balance > buckets - that USDC is
// inert by design and can't be swept by anyone.
const bucketed = active + ownerFees + rewardPool + bonusPool;
report("balance == active+owner+reward+bonus", `${formatUnits(held, 6)} == ${formatUnits(bucketed, 6)}`, held === bucketed);

report("totalJarsCreated", (await read(JAR_ABI, jarAddress, "totalJarsCreated")).toString());
report("totalWithdrawn (principal)", `${formatUnits(await read(JAR_ABI, jarAddress, "totalWithdrawn"), 6)} USDC`);
report("totalRewardsPaid", `${formatUnits(await read(JAR_ABI, jarAddress, "totalRewardsPaid"), 6)} USDC`);
report("totalBonusPaid", `${formatUnits(await read(JAR_ABI, jarAddress, "totalBonusPaid"), 6)} USDC`);
report("totalPointsAwarded", (await read(JAR_ABI, jarAddress, "totalPointsAwarded")).toString());

if (userAddress && isAddress(userAddress)) {
  console.log(`\n\u001b[1mSaver ${userAddress}\u001b[0m`);
  const slots = await read(JAR_ABI, jarAddress, "getJars", [userAddress]);
  const activeCount = await read(JAR_ABI, jarAddress, "getActiveJarCount", [userAddress]);
  const balance = await read(ERC20_ABI, usdcAddress, "balanceOf", [userAddress]);
  const allowance = await read(ERC20_ABI, usdcAddress, "allowance", [userAddress, jarAddress]);
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  report("jar slots used", `${slots.length} of ${maxJars}`, BigInt(slots.length) <= maxJars);
  report("active jars", `${activeCount}`, activeCount === BigInt(slots.filter((slot) => slot.isActive).length));

  let lockedTotal = 0n;
  for (let id = 0; id < slots.length; id += 1) {
    const jar = slots[id];
    console.log(`\n  \u001b[1mJar #${id}\u001b[0m`);
    const remaining = await read(JAR_ABI, jarAddress, "getTimeRemaining", [userAddress, BigInt(id)]);
    report(`  isActive`, String(jar.isActive));
    report(`  amount`, `${formatUnits(jar.amount, 6)} USDC`);
    report(`  jarName`, JSON.stringify(jar.jarName));
    report(`  unlockTime`, jar.unlockTime ? new Date(Number(jar.unlockTime) * 1000).toISOString() : "-");
    report(`  createdAt`, jar.createdAt ? new Date(Number(jar.createdAt) * 1000).toISOString() : "-");
    report(`  getTimeRemaining`, `${remaining}s`);
    if (jar.isActive) {
      const reward = await read(JAR_ABI, jarAddress, "pendingReward", [userAddress, BigInt(id)]);
      const bonus = await read(JAR_ABI, jarAddress, "previewBonus", [userAddress, BigInt(id)]);
      report(`  pendingReward (if withdrawn now)`, `${formatUnits(reward, 6)} USDC`);
      report(`  previewBonus (if withdrawn now)`, `${formatUnits(bonus, 6)} USDC`);
    }

    const consistent = jar.isActive
      ? jar.amount > 0n && jar.unlockTime > jar.createdAt && (remaining === 0n ? jar.unlockTime <= nowSeconds + 5n : jar.unlockTime > nowSeconds - 5n)
      : jar.amount === 0n && remaining === 0n;
    report(`  slot state consistent`, consistent ? "yes" : "NO", consistent);
    if (jar.isActive) lockedTotal += jar.amount;
  }

  const userPoints = await read(JAR_ABI, jarAddress, "points", [userAddress]);
  const userTier = await read(JAR_ABI, jarAddress, "getTier", [userAddress]);
  const TIER_NAMES = ["Bronze", "Silver", "Gold", "Platinum"];

  console.log("");
  report("this wallet's locked total", `${formatUnits(lockedTotal, 6)} USDC`, lockedTotal <= active);
  report("USDC balance", `${formatUnits(balance, 6)} USDC`);
  report("allowance to jar", `${formatUnits(allowance, 6)} USDC`);
  report("points", `${userPoints}`);
  report("tier", TIER_NAMES[Number(userTier)] ?? `#${userTier}`);
} else {
  console.log("  (pass --user 0x... to inspect a specific saver's jars)");
}

console.log(
  failures === 0
    ? `\n\u001b[32m\u001b[1mAll checks passed.\u001b[0m\n`
    : `\n\u001b[31m\u001b[1m${failures} check(s) failed.\u001b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
