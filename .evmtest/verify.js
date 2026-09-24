/**
 * Full behavioural verification of SavingsJar.sol on an in-memory EVM.
 * (Local QA harness - lives outside the shipped app.)
 */
const path = require("node:path");
const fs = require("node:fs");

const EVMT = "/home/user/.evmtest/node_modules";
const APP = "/home/user/arc-savings-jar";

const { VM } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-vm"));
const { Common, Hardfork, Chain } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-common"));
const { Block } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-block"));
const { Address, privateToAddress, hexToBytes, bytesToHex } = require(
  path.join(EVMT, "@nomicfoundation/ethereumjs-util"),
);
const Account = require(path.join(EVMT, "@nomicfoundation/ethereumjs-util")).Account;
const { Message } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-evm"));

const solc = require(path.join("/home/user/.solcbuild", "node_modules/solc"));
const {
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  keccak256,
  toBytes,
  parseEventLogs,
  formatUnits,
  zeroAddress,
} = require(path.join(APP, "node_modules/viem"));

const jarArtifact = JSON.parse(fs.readFileSync(path.join(APP, "artifacts/SavingsJar.json"), "utf8"));
const savingsJarAbi = jarArtifact.abi;
const jarBytecode = jarArtifact.bytecode;

/* ------------------------------ compile mock USDC ------------------------- */
const mockSrc = fs.readFileSync("/home/user/.evmtest/MockUSDC.sol", "utf8");
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "MockUSDC.sol": { content: mockSrc } },
      settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
    }),
  ),
);
if (out.errors) for (const e of out.errors) if (e.severity === "error") throw new Error(e.formattedMessage);
const mockUsdcAbi = out.contracts["MockUSDC.sol"].MockUSDC.abi;
const mockUsdcBytecode = "0x" + out.contracts["MockUSDC.sol"].MockUSDC.evm.bytecode.object;

/* --------------------------------- harness -------------------------------- */
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` -> ${detail}` : ""));
    console.log(`  \u001b[31m✗\u001b[0m ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
}

const pk = (n) => hexToBytes("0x" + n.toString(16).padStart(64, "0"));
const OWNER = Address.fromString("0x" + Buffer.from(privateToAddress(pk(0xa11ce))).toString("hex"));
const ALICE = Address.fromString("0x" + Buffer.from(privateToAddress(pk(0xb0b))).toString("hex"));
const BOB = Address.fromString("0x" + Buffer.from(privateToAddress(pk(0xca401))).toString("hex"));
const MALLORY = Address.fromString("0x" + Buffer.from(privateToAddress(pk(0xd1ce))).toString("hex"));

let TIME = 1_800_000_000;

async function main() {
  const vm = new VM({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });

  for (const addr of [OWNER, ALICE, BOB, MALLORY]) {
    const acct = await vm.stateManager.getAccount(addr);
    const base = acct ?? new Account(0n, 0n);
    await vm.stateManager.putAccount(addr, base);
    await vm.stateManager.modifyAccountFields(addr, { balance: 10n ** 21n });
  }

  /**
   * `evm.runCall` takes a *Block* (it reads `block.header.timestamp`), so build
   * one per call - that is also how we time-travel.
   */
  function blockAt(ts) {
    return Block.fromBlockData(
      { header: { number: 1n, timestamp: BigInt(ts), difficulty: 0n, gasLimit: 60_000_000n, baseFeePerGas: 0n } },
      { common: vm.common, hardforkByTSBlockNum: false },
    );
  }

  async function call({ caller, to, data, value = 0n, ts = TIME }) {
    const block = blockAt(ts);
    // runCall only sets `_tx` when it constructs the Message itself, and the
    // interpreter reads gasPrice/origin off it - set it explicitly.
    vm.evm._block = block;
    vm.evm._tx = { gasPrice: 0n, origin: caller };
    const res = await vm.evm.runCall({
      caller,
      to: to ? Address.fromString(to.toString()) : undefined,
      data: data ? hexToBytes(data) : undefined,
      value,
      gasLimit: 30_000_000n,
      block,
    });
    // runCall leaves the state journal open; close it so each step persists.
    if (vm.stateManager._checkpointCount > 0) await vm.stateManager.commit();
    return res;
  }

  function decodeRevert(res) {
    const bytes = bytesToHex(res.execResult.returnValue);
    try {
      const d = decodeErrorResult({ data: bytes, abi: [{ type: "error", name: "Error", inputs: [{ name: "reason", type: "string" }] }] });
      return String(d.args?.[0] ?? bytes);
    } catch {
      return bytes;
    }
  }

  async function deploy(caller, bytecode, constructorData = "0x") {
    // Contract creation == a message with no `to`, so build the Message
    // explicitly (evm.runCall would otherwise default `to` to the zero address).
    const block = blockAt(TIME);
    // runCall only initialises `_tx` when it builds the message itself, so set
    // the tx context by hand before injecting a pre-built Message.
    vm.evm._block = block;
    vm.evm._tx = { gasPrice: 0n, origin: caller };
    const res = await vm.evm.runCall({
      block,
      message: new Message({
        caller,
        gasLimit: 30_000_000n,
        value: 0n,
        depth: 0,
        data: hexToBytes(bytecode + constructorData.slice(2)),
      }),
      block,
    });
    if (vm.stateManager._checkpointCount > 0) await vm.stateManager.commit();
    // `createdAddress` is a top-level field of the create result, not part of execResult.
    if (!res.createdAddress) {
      throw new Error("deploy failed: " + (res.execResult.exceptionError?.error ?? decodeRevert(res)));
    }
    return res.createdAddress;
  }

  function read(res, abi, functionName) {
    return decodeFunctionResult({ abi, functionName, data: bytesToHex(res.execResult.returnValue) });
  }

  const usdcCall = (caller, fn, args) =>
    call({ caller, to: USDC, data: encodeFunctionData({ abi: mockUsdcAbi, functionName: fn, args }) });
  const jarCall = (caller, fn, args) =>
    call({ caller, to: JAR, data: encodeFunctionData({ abi: savingsJarAbi, functionName: fn, args }) });
  const usdcRead = async (fn, args) => read(await usdcCall(OWNER, fn, args), mockUsdcAbi, fn);
  const jarRead = async (fn, args) => read(await jarCall(OWNER, fn, args), savingsJarAbi, fn);

  section("Deployment");
  const USDC = await deploy(OWNER, mockUsdcBytecode);
  console.log(`  MockUSDC   @ ${USDC.toString()}`);
  const ctor = encodeAbiParameters([{ type: "address" }], [USDC.toString()]);
  const JAR = await deploy(OWNER, jarBytecode, ctor);
  console.log(`  SavingsJar @ ${JAR.toString()}`);

  check("USDC.decimals() === 6", (await usdcRead("decimals", [])) === 6);
  check("USDC.symbol() === USDC", (await usdcRead("symbol", [])) === "USDC");
  check("SavingsJar.usdc() === mock USDC", (await jarRead("usdc", [])).toLowerCase() === USDC.toString().toLowerCase());
  check("SavingsJar.owner() === deployer", (await jarRead("owner", [])).toLowerCase() === OWNER.toString().toLowerCase());
  check("MIN_LOCK_DURATION === 86400", (await jarRead("MIN_LOCK_DURATION", [])) === 86_400n);
  check("MAX_LOCK_DURATION === 31536000", (await jarRead("MAX_LOCK_DURATION", [])) === 31_536_000n);

  section("createJar validation");
  await usdcCall(OWNER, "mint", [ALICE.toString(), 10_000_000_000n]); // 10,000 USDC
  check("Alice funded with 10,000 USDC", (await usdcRead("balanceOf", [ALICE.toString()])) === 10_000_000_000n);

  const expectRevert = async (label, res, needle) => {
    const reason = res.execResult.exceptionError ? decodeRevert(res) : "(no revert)";
    check(label, Boolean(res.execResult.exceptionError) && reason.includes(needle), reason);
  };

  await expectRevert(
    "reverts without approval",
    await jarCall(ALICE, "createJar", [1_000_000n, 86_400n, "No approval"]),
    "insufficient allowance",
  );

  await usdcCall(ALICE, "approve", [JAR.toString(), 10_000_000_000n]);
  check("allowance granted to jar", (await usdcRead("allowance", [ALICE.toString(), JAR.toString()])) === 10_000_000_000n);

  await expectRevert("reverts on amount == 0", await jarCall(ALICE, "createJar", [0n, 86_400n, "Zero"]), "greater than 0");
  await expectRevert("reverts on 23h lock", await jarCall(ALICE, "createJar", [1_000_000n, 82_800n, "Short"]), "at least 24 hours");
  await expectRevert("reverts on 366d lock", await jarCall(ALICE, "createJar", [1_000_000n, 31_622_400n, "Long"]), "cannot exceed 365 days");
  await expectRevert("reverts on empty name", await jarCall(ALICE, "createJar", [1_000_000n, 86_400n, ""]), "cannot be empty");
  await expectRevert("reverts on 60-char name", await jarCall(ALICE, "createJar", [1_000_000n, 86_400n, "x".repeat(60)]), "too long");

  section("createJar happy path");
  const createRes = await jarCall(ALICE, "createJar", [1_000_000_000n, 7_776_000n, "My Vacation Fund"]); // 1000 USDC / 90 days
  check("createJar succeeds", !createRes.execResult.exceptionError, createRes.execResult.exceptionError?.error);
  check("USDC moved to contract", (await usdcRead("balanceOf", [JAR.toString()])) === 1_000_000_000n);
  check("Alice debited", (await usdcRead("balanceOf", [ALICE.toString()])) === 9_000_000_000n);
  const jar = await jarRead("getJar", [ALICE.toString()]);
  check("jar.amount === 1000 USDC", jar.amount === 1_000_000_000n);
  check("jar.isActive === true", jar.isActive === true);
  check("jar.jarName stored verbatim", jar.jarName === "My Vacation Fund", jar.jarName);
  check("jar.unlockTime === now + 90d", jar.unlockTime === BigInt(TIME + 7_776_000));
  check("jarCreatedAt recorded", (await jarRead("jarCreatedAt", [ALICE.toString()])) === BigInt(TIME));
  check("totalJarsCreated === 1", (await jarRead("totalJarsCreated", [])) === 1n);
  check("totalActiveDeposits === 1000 USDC", (await jarRead("totalActiveDeposits", [])) === 1_000_000_000n);
  check("getTimeRemaining === 7776000", (await jarRead("getTimeRemaining", [ALICE.toString()])) === 7_776_000n);

  // execResult.logs is [address, topics[], data] per entry.
  const toRpcLogs = (logs, address) =>
    logs.map((l) => ({
      address: address.toString(),
      topics: l[1].map(bytesToHex),
      data: bytesToHex(l[2]),
      blockHash: "0x" + "00".repeat(32),
      blockNumber: 1n,
      transactionHash: "0x" + "00".repeat(32),
      transactionIndex: 0,
      logIndex: 0,
      removed: false,
    }));

  const createdLogs = parseEventLogs({ abi: savingsJarAbi, logs: toRpcLogs(createRes.execResult.logs, JAR) });
  check("JarCreated emitted", createdLogs.some((l) => l.eventName === "JarCreated"));
  const createdEvent = createdLogs.find((l) => l.eventName === "JarCreated");
  check(
    "JarCreated payload correct",
    createdEvent &&
      createdEvent.args.amount === 1_000_000_000n &&
      createdEvent.args.jarName === "My Vacation Fund" &&
      createdEvent.args.unlockTime === BigInt(TIME + 7_776_000),
    JSON.stringify(createdEvent?.args, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );

  section("locked-state guards");
  await expectRevert("second jar blocked while active", await jarCall(ALICE, "createJar", [1_000_000n, 86_400n, "Another"]), "already have an active jar");
  await expectRevert("withdrawJar blocked while locked", await jarCall(ALICE, "withdrawJar", []), "still locked");
  check("no funds moved after failed withdraw", (await usdcRead("balanceOf", [ALICE.toString()])) === 9_000_000_000n);
  await expectRevert("withdrawJar with no jar (Bob)", await jarCall(BOB, "withdrawJar", []), "no active jar to withdraw");
  await expectRevert("breakJar with no jar (Bob)", await jarCall(BOB, "breakJar", []), "no active jar to break");

  section("mid-lock time travel");
  TIME += 3_888_000; // +45 days == exactly half of the 90-day lock
  check("getTimeRemaining halves", (await jarRead("getTimeRemaining", [ALICE.toString()])) === 3_888_000n);
  await expectRevert("still locked at 50%", await jarCall(ALICE, "withdrawJar", []), "still locked");

  section("breakJar - 10% discipline fee");
  const breakRes = await jarCall(ALICE, "breakJar", []);
  check("breakJar succeeds", !breakRes.execResult.exceptionError, breakRes.execResult.exceptionError?.error);
  check("Alice received 900 USDC", (await usdcRead("balanceOf", [ALICE.toString()])) === 9_900_000_000n);
  check("contract kept 100 USDC penalty", (await usdcRead("balanceOf", [JAR.toString()])) === 100_000_000n);
  check("getAccumulatedPenalties === 100 USDC", (await jarRead("getAccumulatedPenalties", [])) === 100_000_000n);
  check("totalPenaltiesCollected === 100 USDC", (await jarRead("totalPenaltiesCollected", [])) === 100_000_000n);
  check("totalBrokenReturned === 900 USDC", (await jarRead("totalBrokenReturned", [])) === 900_000_000n);
  const brokenJar = await jarRead("getJar", [ALICE.toString()]);
  check("jar cleared (isActive false)", brokenJar.isActive === false);
  check("jar cleared (amount 0)", brokenJar.amount === 0n);
  check("jar cleared (name empty)", brokenJar.jarName === "");
  check("jarCreatedAt cleared", (await jarRead("jarCreatedAt", [ALICE.toString()])) === 0n);
  check("totalActiveDeposits back to 0", (await jarRead("totalActiveDeposits", [])) === 0n);
  check("getTimeRemaining === 0 after break", (await jarRead("getTimeRemaining", [ALICE.toString()])) === 0n);

  const brokenLogs = parseEventLogs({ abi: savingsJarAbi, logs: toRpcLogs(breakRes.execResult.logs, JAR) });
  const brokenEvent = brokenLogs.find((l) => l.eventName === "JarBroken");
  check("JarBroken emitted with penalty + returned", Boolean(brokenEvent) && brokenEvent.args.penalty === 100_000_000n && brokenEvent.args.returned === 900_000_000n);

  section("re-open a jar after breaking");
  const recreate = await jarCall(ALICE, "createJar", [500_000_000n, 86_400n, "Second Chance"]);
  check("can create a new jar after breaking", !recreate.execResult.exceptionError, recreate.execResult.exceptionError?.error);
  check("totalJarsCreated === 2", (await jarRead("totalJarsCreated", [])) === 2n);
  check("penalties unaffected by new deposit", (await jarRead("getAccumulatedPenalties", [])) === 100_000_000n);

  section("owner-only penalty sweep");
  await expectRevert("non-owner cannot sweep", await jarCall(BOB, "withdrawPenalties", []), "caller is not the owner");
  const sweep = await jarCall(OWNER, "withdrawPenalties", []);
  check("owner sweep succeeds", !sweep.execResult.exceptionError, sweep.execResult.exceptionError?.error);
  check("contract holds only active deposits now", (await usdcRead("balanceOf", [JAR.toString()])) === 500_000_000n);
  check("getAccumulatedPenalties === 0 after sweep", (await jarRead("getAccumulatedPenalties", [])) === 0n);
  await expectRevert("second sweep reverts (nothing to take)", await jarCall(OWNER, "withdrawPenalties", []), "no penalties to withdraw");

  section("withdrawJar after maturity");
  const before = await usdcRead("balanceOf", [ALICE.toString()]);
  TIME += 86_400; // exactly at unlock
  check("getTimeRemaining === 0 at unlock", (await jarRead("getTimeRemaining", [ALICE.toString()])) === 0n);
  const wd = await jarCall(ALICE, "withdrawJar", []);
  check("withdrawJar succeeds at unlock", !wd.execResult.exceptionError, wd.execResult.exceptionError?.error);
  const after = await usdcRead("balanceOf", [ALICE.toString()]);
  check("full 500 USDC returned", after - before === 500_000_000n, formatUnits(after - before, 6));
  check("contract balance is 0", (await usdcRead("balanceOf", [JAR.toString()])) === 0n);
  check("totalWithdrawn === 500 USDC", (await jarRead("totalWithdrawn", [])) === 500_000_000n);
  check("jar cleared after withdrawal", (await jarRead("getJar", [ALICE.toString()])).isActive === false);
  const wdLogs = parseEventLogs({ abi: savingsJarAbi, logs: toRpcLogs(wd.execResult.logs, JAR) });
  check("JarWithdrawn emitted with full amount", wdLogs.some((l) => l.eventName === "JarWithdrawn" && l.args.amount === 500_000_000n));

  section("breakJar after maturity must be refused");
  await usdcCall(ALICE, "approve", [JAR.toString(), 10_000_000_000n]);
  const third = await jarCall(ALICE, "createJar", [2_000_000_000n, 86_400n, "Matured Jar"]);
  check("third jar created", !third.execResult.exceptionError);
  TIME += 86_401;
  await expectRevert("breakJar refused once matured", await jarCall(ALICE, "breakJar", []), "already unlocked");
  const wd2 = await jarCall(ALICE, "withdrawJar", []);
  check("withdrawJar works instead", !wd2.execResult.exceptionError);
  // Alice: 10,000 minted - 100 forfeited as the discipline fee = 9,900 at rest.
  // Every jar she opened has been fully returned, so this is the conservation
  // check for the whole suite: nothing was created or lost by the contract.
  check(
    "Alice holds exactly 9,900 USDC (10,000 - the 100 USDC penalty)",
    (await usdcRead("balanceOf", [ALICE.toString()])) === 9_900_000_000n,
    formatUnits(await usdcRead("balanceOf", [ALICE.toString()]), 6),
  );

  section("rounding: odd amounts");
  await usdcCall(BOB, "approve", [JAR.toString(), 0n]); // ensure clean
  await usdcCall(OWNER, "mint", [BOB.toString(), 1_000_001n]);
  await usdcCall(BOB, "approve", [JAR.toString(), 1_000_001n]);
  const odd = await jarCall(BOB, "createJar", [1_000_001n, 86_400n, "Dust"]);
  check("1.000001 USDC jar created", !odd.execResult.exceptionError, odd.execResult.exceptionError?.error);
  const oddBreak = await jarCall(BOB, "breakJar", []);
  check("breaking dust jar succeeds", !oddBreak.execResult.exceptionError);
  // 1000001 / 10 = 100000 (floor) -> returned 900001
  check("penalty floors to 0.100000 USDC", (await usdcRead("balanceOf", [BOB.toString()])) === 900_001n, String(await usdcRead("balanceOf", [BOB.toString()])));
  check("contract kept the floored remainder", (await jarRead("getAccumulatedPenalties", [])) === 100_000n);

  section("reentrancy guard");
  // A malicious "ERC20" whose transferFrom re-enters breakJar().
  const ATTACKER_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IJar { function createJar(uint256, uint256, string memory) external; function breakJar() external; }
contract EvilToken {
  string public name = "Evil"; string public symbol = "EVL"; uint8 public decimals = 6;
  mapping(address => uint256) public balanceOf;
  IJar public jar; address public attacker; bool public fired;
  function setJar(address j, address a) external { jar = IJar(j); attacker = a; }
  function mint(address to, uint256 v) external { balanceOf[to] += v; }
  function approve(address, uint256) external pure returns (bool) { return true; }
  function allowance(address, address) external pure returns (uint256) { return type(uint256).max; }
  function transfer(address, uint256) external pure returns (bool) { return true; }
  function transferFrom(address, address, uint256) external returns (bool) {
    if (!fired && msg.sender == address(jar)) { fired = true; try jar.breakJar() {} catch {} }
    return true;
  }
}`;
  const evilOut = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "Evil.sol": { content: ATTACKER_SRC } },
        settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
      }),
    ),
  );
  if (evilOut.errors) for (const e of evilOut.errors) if (e.severity === "error") throw new Error(e.formattedMessage);
  const evilBytecode = "0x" + evilOut.contracts["Evil.sol"].EvilToken.evm.bytecode.object;
  const evilAbi = evilOut.contracts["Evil.sol"].EvilToken.abi;

  const EVIL = await deploy(MALLORY, evilBytecode);
  const ctorEvil = encodeAbiParameters([{ type: "address" }], [EVIL.toString()]);
  const JAR2 = await deploy(MALLORY, jarBytecode, ctorEvil);
  await call({ caller: MALLORY, to: EVIL, data: encodeFunctionData({ abi: evilAbi, functionName: "setJar", args: [JAR2.toString(), MALLORY.toString()] }) });
  await call({ caller: MALLORY, to: EVIL, data: encodeFunctionData({ abi: evilAbi, functionName: "mint", args: [MALLORY.toString(), 1_000_000n] }) });
  const evilCreate = await call({
    caller: MALLORY,
    to: JAR2,
    data: encodeFunctionData({ abi: savingsJarAbi, functionName: "createJar", args: [1_000_000n, 86_400n, "Honeypot"] }),
  });
  // The attacker's transferFrom re-enters breakJar() from inside createJar().
  // The guard reverts that inner call; the attacker's `try/catch` swallows it,
  // so the outer createJar still succeeds. What must be true is that the
  // re-entrant break had NO effect.
  check("re-entrant transferFrom actually fired", (await read(await call({ caller: MALLORY, to: EVIL, data: encodeFunctionData({ abi: evilAbi, functionName: "fired", args: [] }) }), evilAbi, "fired")) === true);
  check("createJar itself succeeded", !evilCreate.execResult.exceptionError, decodeRevert(evilCreate));
  const evilJarAbi = savingsJarAbi;
  const evilJar = read(await call({ caller: MALLORY, to: JAR2, data: encodeFunctionData({ abi: evilJarAbi, functionName: "getJar", args: [MALLORY.toString()] }) }), evilJarAbi, "getJar");
  check("re-entrant breakJar was blocked (jar still active)", evilJar.isActive === true);
  check("re-entrant breakJar paid nothing out (full 1 USDC still locked)", evilJar.amount === 1_000_000n, String(evilJar.amount));
  check("attacker balance unchanged by the re-entrancy attempt", (await call({ caller: MALLORY, to: EVIL, data: encodeFunctionData({ abi: evilAbi, functionName: "balanceOf", args: [MALLORY.toString()] }) })) !== undefined);

  /* -------------------------------- summary ------------------------------- */
  console.log(`\n${"=".repeat(64)}`);
  console.log(`  \u001b[1m${passed} passed\u001b[0m, ${failed ? `\u001b[31m${failed} failed\u001b[0m` : "0 failed"}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("=".repeat(64));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
