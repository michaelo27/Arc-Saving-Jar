/**
 * goal-jar.test.js
 * ---------------------------------------------------------------------------
 * Behavioural verification of the Piggy Savings feature (goal jars +
 * bit-by-bit top-ups) in SavingsJar.sol, run on an in-memory EVM.
 *
 * Local QA harness - lives outside the shipped app. Run with:
 *   node .evmtest/goal-jar.test.js
 */
const path = require("node:path");
const fs = require("node:fs");

const EVMT = path.join(__dirname, "node_modules");
const APP = path.resolve(__dirname, "..", "arc-savings-jar");

const { VM } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-vm"));
const { Common, Hardfork, Chain } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-common"));
const { Block } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-block"));
const { Address, privateToAddress, hexToBytes, bytesToHex, Account } = require(
  path.join(EVMT, "@nomicfoundation/ethereumjs-util"),
);
const { Message } = require(path.join(EVMT, "@nomicfoundation/ethereumjs-evm"));

const solc = require(path.join(APP, "node_modules/solc"));
const {
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  parseEventLogs,
} = require(path.join(APP, "node_modules/viem"));

const jarArtifact = JSON.parse(fs.readFileSync(path.join(APP, "artifacts/SavingsJar.json"), "utf8"));
const savingsJarAbi = jarArtifact.abi;
const jarBytecode = jarArtifact.bytecode;

/* ------------------------------ compile mock USDC ------------------------- */
const mockSrc = fs.readFileSync(path.join(__dirname, "MockUSDC.sol"), "utf8");
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

const DAY = 86_400n;
let TIME = 1_800_000_000;

async function main() {
  const vm = new VM({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });

  for (const addr of [OWNER, ALICE, BOB]) {
    const acct = await vm.stateManager.getAccount(addr);
    const base = acct ?? new Account(0n, 0n);
    await vm.stateManager.putAccount(addr, base);
    await vm.stateManager.modifyAccountFields(addr, { balance: 10n ** 21n });
  }

  function blockAt(ts) {
    return Block.fromBlockData(
      { header: { number: 1n, timestamp: BigInt(ts), difficulty: 0n, gasLimit: 60_000_000n, baseFeePerGas: 0n } },
      { common: vm.common, hardforkByTSBlockNum: false },
    );
  }

  async function call({ caller, to, data, value = 0n, ts = TIME }) {
    const block = blockAt(ts);
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
    const block = blockAt(TIME);
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
    });
    if (vm.stateManager._checkpointCount > 0) await vm.stateManager.commit();
    if (!res.createdAddress) {
      throw new Error("deploy failed: " + (res.execResult.exceptionError?.error ?? decodeRevert(res)));
    }
    return res.createdAddress;
  }

  function read(res, abi, functionName) {
    return decodeFunctionResult({ abi, functionName, data: bytesToHex(res.execResult.returnValue) });
  }

  function eventsOf(res, eventName) {
    if (!res.execResult.logs || res.execResult.logs.length === 0) return [];
    const logs = res.execResult.logs.map((entry) => {
      // execResult.logs entries are [address, topics[], data] as raw bytes.
      const [address, topics, data] = entry;
      const addressHex =
        typeof address === "string"
          ? address
          : "0x" + Buffer.from(address).toString("hex");
      return {
        address: addressHex,
        topics: topics.map((t) => (typeof t === "string" ? t : bytesToHex(t))),
        data: typeof data === "string" ? data : bytesToHex(data),
      };
    });
    try {
      return parseEventLogs({ abi: savingsJarAbi, logs, eventName });
    } catch (error) {
      console.log("    [eventsOf] parse error:", error.message);
      return [];
    }
  }

  const usdcCall = (caller, fn, args, ts) =>
    call({ caller, to: USDC, data: encodeFunctionData({ abi: mockUsdcAbi, functionName: fn, args }), ts });
  const jarCall = (caller, fn, args, ts) =>
    call({ caller, to: JAR, data: encodeFunctionData({ abi: savingsJarAbi, functionName: fn, args }), ts });
  const usdcRead = async (fn, args) => read(await usdcCall(OWNER, fn, args), mockUsdcAbi, fn);
  const jarRead = async (fn, args) => read(await jarCall(OWNER, fn, args), savingsJarAbi, fn);

  const expectRevert = async (label, res, needle) => {
    const reason = res.execResult.exceptionError ? decodeRevert(res) : "(no revert)";
    check(label, Boolean(res.execResult.exceptionError) && reason.includes(needle), reason);
  };
  const expectOk = (label, res) =>
    check(label, !res.execResult.exceptionError, res.execResult.exceptionError?.error ?? decodeRevert(res));

  /* ------------------------------- deployment ----------------------------- */
  section("Deployment");
  const USDC = await deploy(OWNER, mockUsdcBytecode);
  const ctor = encodeAbiParameters([{ type: "address" }], [USDC.toString()]);
  const JAR = await deploy(OWNER, jarBytecode, ctor);
  console.log(`  MockUSDC   @ ${USDC.toString()}\n  SavingsJar @ ${JAR.toString()}`);

  for (const who of [ALICE, BOB]) {
    await usdcCall(OWNER, "mint", [who.toString(), 1_000_000_000_000n]); // 1,000,000 USDC
    await usdcCall(who, "approve", [JAR.toString(), 1_000_000_000_000n]);
  }
  check("balances funded", (await usdcRead("balanceOf", [ALICE.toString()])) === 1_000_000_000_000n);

  // The owner funds the bonus pool once so time bonuses actually pay out.
  await usdcCall(OWNER, "mint", [OWNER.toString(), 1_000_000_000n]);
  await usdcCall(OWNER, "approve", [JAR.toString(), 1_000_000_000n]);
  expectOk("bonus pool funded (1,000 USDC)", await jarCall(OWNER, "fundBonusPool", [1_000_000_000n]));

  const usdcOf = (who) => usdcRead("balanceOf", [who.toString()]);
  const getJar = (who, id) => jarRead("getJar", [who.toString(), BigInt(id)]);

  /* --------------------------- createGoalJar ------------------------------ */
  section("createGoalJar");
  await expectRevert(
    "goal below initial deposit reverts",
    await jarCall(ALICE, "createGoalJar", [1_000_000_000n, 90n * DAY, "Car fund", 999_999_999n]),
    "goal must be at least the initial deposit",
  );

  const createRes = await jarCall(ALICE, "createGoalJar", [1_000_000_000n, 90n * DAY, "Car fund", 5_000_000_000n]);
  expectOk("createGoalJar succeeds (1,000 in, goal 5,000)", createRes);
  const createdEvents = eventsOf(createRes, "JarCreated");
  check("JarCreated emitted with targetAmount", createdEvents.length === 1 && createdEvents[0].args.targetAmount === 5_000_000_000n);

  let jar = await getJar(ALICE, 0);
  check("jar.amount === 1,000 USDC", jar.amount === 1_000_000_000n);
  check("jar.targetAmount stored", jar.targetAmount === 5_000_000_000n);
  check("jar.lastFundedAt === createdAt", jar.lastFundedAt === jar.createdAt && jar.createdAt === BigInt(TIME));
  check("isGoalReached false at start", (await jarRead("isGoalReached", [ALICE.toString(), 0n])) === false);
  check("goalRemaining === 4,000 USDC", (await jarRead("goalRemaining", [ALICE.toString(), 0n])) === 4_000_000_000n);

  // Classic createJar still works and has target 0. Short 1-day lock so it can
  // be withdrawn (and its slot freed) before the reward-share section below.
  expectOk("classic createJar still works", await jarCall(BOB, "createJar", [100_000_000n, DAY, "Classic"]));
  check("classic jar has targetAmount === 0", (await getJar(BOB, 0)).targetAmount === 0n);

  /* ------------------------------- addToJar ------------------------------- */
  section("addToJar - bit-by-bit top-ups");
  await expectRevert("zero top-up reverts", await jarCall(ALICE, "addToJar", [0n, 0n]), "greater than 0");
  await expectRevert("invalid jar id reverts", await jarCall(ALICE, "addToJar", [7n, 1_000_000n]), "invalid jar id");
  await expectRevert(
    "cannot top up someone else's jar id",
    await jarCall(BOB, "addToJar", [1n, 1_000_000n]),
    "invalid jar id", // Bob has no jar slot 1 - jars are per wallet
  );

  const aliceBefore = await usdcOf(ALICE);
  const topUpRes = await jarCall(ALICE, "addToJar", [0n, 500_000_000n]);
  expectOk("top-up of 500 USDC succeeds", topUpRes);
  const toppedEvents = eventsOf(topUpRes, "JarToppedUp");
  check("JarToppedUp emitted (added, newTotal)", toppedEvents.length === 1 && toppedEvents[0].args.added === 500_000_000n && toppedEvents[0].args.newTotal === 1_500_000_000n);
  check("no GoalReached yet", eventsOf(topUpRes, "GoalReached").length === 0);

  jar = await getJar(ALICE, 0);
  check("jar.amount now 1,500 USDC", jar.amount === 1_500_000_000n);
  check("jar.lastFundedAt moved to the top-up", jar.lastFundedAt === BigInt(TIME));
  check("goalRemaining now 3,500 USDC", (await jarRead("goalRemaining", [ALICE.toString(), 0n])) === 3_500_000_000n);
  check("totalActiveDeposits tracks top-ups", (await jarRead("totalActiveDeposits", [])) === 1_500_000_000n + 100_000_000n);
  check("totalToppedUp counter", (await jarRead("totalToppedUp", [])) === 500_000_000n);
  check("Alice debited", aliceBefore - (await usdcOf(ALICE)) === 500_000_000n);

  await expectRevert(
    "top-up overshooting the goal reverts",
    await jarCall(ALICE, "addToJar", [0n, 3_600_000_000n]),
    "exceed the savings goal",
  );

  const fillRes = await jarCall(ALICE, "addToJar", [0n, 3_500_000_000n]);
  expectOk("top-up exactly to the goal succeeds", fillRes);
  const goalEvents = eventsOf(fillRes, "GoalReached");
  check("GoalReached emitted at the target", goalEvents.length === 1 && goalEvents[0].args.totalSaved === 5_000_000_000n && goalEvents[0].args.targetAmount === 5_000_000_000n);
  check("isGoalReached true", (await jarRead("isGoalReached", [ALICE.toString(), 0n])) === true);
  check("goalRemaining === 0", (await jarRead("goalRemaining", [ALICE.toString(), 0n])) === 0n);
  await expectRevert(
    "further top-ups after goal reverts",
    await jarCall(ALICE, "addToJar", [0n, 1_000_000n]),
    "exceed the savings goal",
  );

  /* -------------------- goal-reached early withdrawal --------------------- */
  section("Goal reached -> withdraw early or wait");
  await expectRevert(
    "breakJar refused once the goal is reached",
    await jarCall(ALICE, "breakJar", [0n]),
    "goal reached, use withdrawJar",
  );

  const balancePre = await usdcOf(ALICE);
  const poolPre = await jarRead("bonusPoolBalance", []);
  // Everything happened at the same timestamp, so bonus/points are exactly 0.
  const withdrawRes = await jarCall(ALICE, "withdrawJar", [0n]);
  expectOk("withdrawJar before maturity succeeds (goal reached)", withdrawRes);
  check("full 5,000 USDC returned", (await usdcOf(ALICE)) - balancePre === 5_000_000_000n);
  check("no bonus consumed (no time held)", poolPre === (await jarRead("bonusPoolBalance", [])));
  check("jar slot closed", (await getJar(ALICE, 0)).isActive === false);
  check("totalActiveDeposits reduced", (await jarRead("totalActiveDeposits", [])) === 100_000_000n);

  // Goal set equal to the initial deposit: immediately withdrawable.
  // (Slot 0 was just closed, so the contract reuses it.)
  expectOk("goal jar with goal == deposit", await jarCall(ALICE, "createGoalJar", [200_000_000n, 60n * DAY, "Instant goal", 200_000_000n]));
  check("goal reached instantly", (await jarRead("isGoalReached", [ALICE.toString(), 0n])) === true);
  expectOk("instant-goal jar withdrawable immediately", await jarCall(ALICE, "withdrawJar", [0n]));

  /* --------------- incentive accounting across top-ups --------------------- */
  section("Bonus / points banked per deposit segment");
  // Alice: 1,000 USDC goal jar. After 30 days, top up 1,000 more. Withdraw at maturity.
  const T0 = TIME;
  expectOk("segment jar created (1,000, goal 4,000, 90d)", await jarCall(ALICE, "createGoalJar", [1_000_000_000n, 90n * DAY, "Segment jar", 4_000_000_000n]));
  // Slot reuse: Alice's earlier slots are closed, so this jar lives in slot 0.
  const slot = 0n;

  TIME = T0 + Number(30n * DAY);
  const bonusAfter30 = await jarRead("previewBonus", [ALICE.toString(), slot]);
  const expectBonus30 = (1_000_000_000n * 500n * (30n * DAY)) / (10_000n * 31_536_000n);
  check("previewBonus after 30d on 1,000 USDC", bonusAfter30 === expectBonus30, `${bonusAfter30} != ${expectBonus30}`);

  expectOk("top up 1,000 after 30 days", await jarCall(ALICE, "addToJar", [slot, 1_000_000_000n]));
  jar = await getJar(ALICE, slot);
  check("bonus banked on top-up", jar.bonusAccrued === expectBonus30, `${jar.bonusAccrued} != ${expectBonus30}`);
  check("points banked on top-up (30,000 USDC-days)", jar.pointsAccrued === (1_000_000_000n * (30n * DAY)) / (1_000_000n * DAY));
  check("previewBonus right after top-up == banked", (await jarRead("previewBonus", [ALICE.toString(), slot])) === expectBonus30);

  // Withdraw at maturity: T0 + 91 days (one day past the 90-day lock).
  TIME = T0 + Number(91n * DAY);
  const segmentSeconds = 61n * DAY; // from the top-up at T0+30d to T0+91d
  const expectBonusFinal = expectBonus30 + (2_000_000_000n * 500n * segmentSeconds) / (10_000n * 31_536_000n);
  const expectPointsFinal = (1_000_000_000n * (30n * DAY)) / (1_000_000n * DAY) + (2_000_000_000n * segmentSeconds) / (1_000_000n * DAY);
  check("previewBonus at maturity (banked + segment)", (await jarRead("previewBonus", [ALICE.toString(), slot])) === expectBonusFinal);

  const pointsPre = await jarRead("points", [ALICE.toString()]);
  const poolBefore = await jarRead("bonusPoolBalance", []);
  const balPre = await usdcOf(ALICE);
  expectOk("withdraw at maturity", await jarCall(ALICE, "withdrawJar", [slot]));
  check(
    "payout = principal + exact segment bonus",
    (await usdcOf(ALICE)) - balPre === 2_000_000_000n + expectBonusFinal,
  );
  check("bonus pool debited exactly", poolBefore - (await jarRead("bonusPoolBalance", [])) === expectBonusFinal);
  check("points credited per segment", (await jarRead("points", [ALICE.toString()])) - pointsPre === expectPointsFinal);

  /* ------------------- reward share survives top-ups ----------------------- */
  section("Penalty-share reward preserved across top-ups");
  TIME += 100; // fresh timestamp, jars above are closed
  // Bob's 1-day classic jar is long matured by now - close it so its 100 USDC
  // doesn't dilute the reward-split math below.
  expectOk("Bob withdraws his matured classic jar", await jarCall(BOB, "withdrawJar", [0n]));

  expectOk("Alice goal jar 1,000 (goal 5,000, 90d)", await jarCall(ALICE, "createGoalJar", [1_000_000_000n, 90n * DAY, "Reward jar", 5_000_000_000n]));
  const rewardSlot = 0n;

  // Bob breaks a 1,000 USDC jar: 100 penalty -> 80 to the reward pool, split
  // over the 1,000 USDC that is active afterwards (Alice's jar only).
  expectOk("Bob creates 1,000 jar", await jarCall(BOB, "createJar", [1_000_000_000n, 30n * DAY, "Bob breakable"]));
  expectOk("Bob breaks it", await jarCall(BOB, "breakJar", [0n]));
  check("accRewardPerShare == 0.08e18", (await jarRead("accRewardPerShare", [])) === (80_000_000n * 10n ** 18n) / 1_000_000_000n);
  check("Alice pending reward == 80 USDC", (await jarRead("pendingReward", [ALICE.toString(), rewardSlot])) === 80_000_000n);

  expectOk("Alice tops up 1,000", await jarCall(ALICE, "addToJar", [rewardSlot, 1_000_000_000n]));
  check("pending reward preserved across top-up", (await jarRead("pendingReward", [ALICE.toString(), rewardSlot])) === 80_000_000n);

  // Bob breaks another jar: the new 80 is shared over 2,000 active USDC,
  // so Alice's doubled deposit earns exactly the same 80 again.
  expectOk("Bob creates another 1,000 jar", await jarCall(BOB, "createJar", [1_000_000_000n, 30n * DAY, "Bob breakable 2"]));
  expectOk("Bob breaks it too", await jarCall(BOB, "breakJar", [0n]));
  check("pending reward now 160 USDC", (await jarRead("pendingReward", [ALICE.toString(), rewardSlot])) === 160_000_000n);

  TIME += Number(91n * DAY); // mature it
  // The jar also earned a time bonus while it sat - read it just before the
  // withdrawal so the payout expectation can include it.
  const bonusAtWithdraw = await jarRead("previewBonus", [ALICE.toString(), rewardSlot]);
  const balBefore = await usdcOf(ALICE);
  const rewardPoolBefore = await jarRead("rewardPoolBalance", []);
  expectOk("mature withdrawal of reward jar", await jarCall(ALICE, "withdrawJar", [rewardSlot]));
  check(
    "payout = principal + exact 160 USDC reward + bonus",
    (await usdcOf(ALICE)) - balBefore === 2_000_000_000n + 160_000_000n + bonusAtWithdraw,
  );
  check("reward pool debited exactly", rewardPoolBefore - (await jarRead("rewardPoolBalance", [])) === 160_000_000n);

  /* ------------------------ classic jars & guards -------------------------- */
  section("Classic jar top-ups and guard rails");
  // Bob's classic jar (slot 0 was closed by the breaks -> reused).
  const bobJar = await getJar(BOB, 0);
  check("Bob has a closed slot 0", bobJar.isActive === false);
  expectOk("Bob opens a fresh classic jar", await jarCall(BOB, "createJar", [100_000_000n, 30n * DAY, "Top-up me"]));

  // Sanity: an *old* jar reference cannot be topped up once closed.
  expectOk("classic jar accepts uncapped top-ups", await jarCall(BOB, "addToJar", [0n, 50_000_000_000n]));
  check("classic jar amount updated", (await getJar(BOB, 0)).amount === 50_100_000_000n);

  await expectRevert(
    "withdraw before maturity still blocked without a goal",
    await jarCall(BOB, "withdrawJar", [0n]),
    "jar is still locked",
  );

  TIME += Number(31n * DAY); // Bob's jar matured
  await expectRevert(
    "top-up after maturity reverts",
    await jarCall(BOB, "addToJar", [0n, 1_000_000n]),
    "already matured",
  );
  expectOk("matured classic jar withdraws fine", await jarCall(BOB, "withdrawJar", [0n]));

  /* -------------------------- third-party gifts --------------------------- */
  section("Gift links - supporters fund the jar owner directly");
  expectOk(
    "Alice creates a goal jar for gifts",
    await jarCall(ALICE, "createGoalJar", [10_000_000n, 60n * DAY, "Community goal", 40_000_000n]),
  );
  const giftJarId = 0n; // Alice's previous jar slots have been closed and reused.
  const giftGeneration = await jarRead("jarGeneration", [ALICE.toString(), giftJarId]);
  check("new jar has a non-zero generation for its share link", giftGeneration > 0n);
  const aliceWalletBeforeGift = await usdcOf(ALICE);
  const bobWalletBeforeGift = await usdcOf(BOB);
  const toppedBeforeGift = await jarRead("totalToppedUp", []);
  const activeBeforeGift = await jarRead("totalActiveDeposits", []);

  const firstGift = await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 25_000_000n, giftGeneration]);
  expectOk("Bob gifts 25 USDC into Alice's jar", firstGift);
  const giftEvents = eventsOf(firstGift, "JarGifted");
  check(
    "JarGifted records donor, recipient, jar and amount",
    giftEvents.length === 1 &&
      giftEvents[0].args.donor.toLowerCase() === BOB.toString().toLowerCase() &&
      giftEvents[0].args.recipient.toLowerCase() === ALICE.toString().toLowerCase() &&
      giftEvents[0].args.jarId === giftJarId &&
      giftEvents[0].args.generation === giftGeneration &&
      giftEvents[0].args.amount === 25_000_000n &&
      giftEvents[0].args.newTotal === 35_000_000n,
  );
  check("Alice's jar balance includes Bob's gift", (await getJar(ALICE, giftJarId)).amount === 35_000_000n);
  check("gift does not transfer USDC to Alice's wallet", (await usdcOf(ALICE)) === aliceWalletBeforeGift);
  check("Bob's wallet pays the gift", bobWalletBeforeGift - (await usdcOf(BOB)) === 25_000_000n);
  check("gifts count toward total active deposits", (await jarRead("totalActiveDeposits", [])) - activeBeforeGift === 25_000_000n);
  check("gifts count toward lifetime top-ups", (await jarRead("totalToppedUp", [])) - toppedBeforeGift === 25_000_000n);
  await expectRevert(
    "a gift cannot overshoot the recipient's goal",
    await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 5_000_001n, giftGeneration]),
    "exceed the savings goal",
  );
  expectOk(
    "gift can fill the exact remaining goal",
    await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 5_000_000n, giftGeneration]),
  );
  check("gift can trigger GoalReached", (await jarRead("isGoalReached", [ALICE.toString(), giftJarId])) === true);
  await expectRevert(
    "the donor cannot withdraw the recipient-owned jar",
    await jarCall(BOB, "withdrawJar", [giftJarId]),
    "no active jar to withdraw",
  );
  expectOk(
    "the recipient can withdraw after the goal is reached",
    await jarCall(ALICE, "withdrawJar", [giftJarId]),
  );
  await expectRevert(
    "a closed jar no longer accepts gifts",
    await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 1_000_000n, giftGeneration]),
    "no active jar to add to",
  );
  expectOk(
    "Alice reuses the closed slot for a new jar",
    await jarCall(ALICE, "createJar", [10_000_000n, 60n * DAY, "Replacement jar"]),
  );
  const replacementGeneration = await jarRead("jarGeneration", [ALICE.toString(), giftJarId]);
  check("reusing a slot increments its generation", replacementGeneration === giftGeneration + 1n);
  await expectRevert(
    "old gift link cannot target the replacement jar",
    await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 1_000_000n, giftGeneration]),
    "stale gift link",
  );
  expectOk(
    "the replacement jar accepts a gift with its fresh generation",
    await jarCall(BOB, "giftToJar", [ALICE.toString(), giftJarId, 1_000_000n, replacementGeneration]),
  );

  /* --------------------------- accounting summary -------------------------- */
  section("Accounting invariant");
  // Multiple outputs decode to a positional array in viem.
  const s = await jarRead("getAccountingSummary", []);
  const [balance, activeDeposits, ownerFees, rewardPool, bonusPool] = s;
  check(
    "balance == active + ownerFees + rewardPool + bonusPool",
    balance === activeDeposits + ownerFees + rewardPool + bonusPool,
    `${balance} != ${activeDeposits}+${ownerFees}+${rewardPool}+${bonusPool}`,
  );

  /* --------------------------------- summary ------------------------------- */
  console.log(`\n${"=".repeat(60)}\n  RESULT: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
