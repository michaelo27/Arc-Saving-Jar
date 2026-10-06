# Arc Savings Jar 🫙

> **Lock your USDC. Grow your discipline. Powered by Arc.**

Arc Savings Jar is a non-custodial savings mini-app on Arc Mainnet. A saver deposits USDC into a personal on-chain jar, chooses a lock between 24 hours and 365 days, and receives the full deposit back after the lock expires.

The application is intentionally small, understandable, and useful: one wallet, one active jar, one savings goal.

## What It Is

Arc Savings Jar is a decentralized time-locked savings application built for Circle's EVM-compatible Arc blockchain. Funds are held by an immutable smart contract rather than by a company, administrator, or server.

Each wallet can have one active jar. The saver chooses the amount, lock duration, and jar name; the contract enforces the deadline on-chain.

## The Problem It Solves

Impulse spending is easy when funds remain immediately accessible. Crypto wallets make moving money fast, but they rarely help users build discipline.

Arc Savings Jar introduces intentional friction without introducing a custodian. A user commits USDC to a goal and lets transparent smart-contract logic enforce the commitment.

## How It Works

1. Connect an EVM wallet to Arc Mainnet.
2. Enter a jar name, USDC amount, and lock duration.
3. Approve the Savings Jar contract to transfer the selected USDC amount.
4. Create the jar. The contract transfers the USDC into on-chain custody and records the unlock timestamp.
5. Watch the live countdown and elapsed-time progress.
6. After the deadline, click **Withdraw** to receive the full deposit.
7. In a genuine emergency, break the jar early. The wallet receives 90%; the remaining 10% stays in the contract as a transparent discipline fee.

The application checks the existing ERC-20 allowance before requesting another approval. Every successful transaction triggers an immediate data refresh.

## Piggy Savings - Goal Jars and Bit-by-Bit Top-Ups 🐷

Alongside classic time-locked jars, a jar can optionally carry a **savings goal** - e.g. "New Car Fund, target 5,000 USDC". Goal jars add three abilities:

1. **Create with a goal.** `createGoalJar(amount, lockDuration, name, targetAmount)` opens a jar whose target is at least the initial deposit. The create form exposes this as an optional "Savings Goal" toggle.
2. **Top up bit by bit.** `addToJar(jarId, amount)` adds USDC to an existing locked jar whenever the saver has spare funds - the piggy-bank flow. Goal jars refuse top-ups that would overshoot the target; classic jars accept top-ups freely. Top-ups are allowed right up to the maturity date.
3. **Withdraw at the goal - or wait.** The moment a goal jar's balance reaches its target, the saver can withdraw everything early with no penalty, or simply keep the jar locked until maturity and keep earning the time bonus. Breaking a jar whose goal is already reached is refused by the contract, since a full withdrawal is strictly better.

Incentive accounting stays exact across top-ups: every deposit only earns the reward share, time bonus, and points for the time *that deposit* was actually held. Each `addToJar` banks the bonus/points accrued so far and re-baselines the reward accumulator; `withdrawJar` pays the banked amounts plus the final deposit segment. The existing accounting invariant holds unchanged:

```text
balance == totalActiveDeposits + ownerFeesAccrued + rewardPoolBalance + bonusPoolBalance
```

New events: `JarToppedUp(user, jarId, added, newTotal)` and `GoalReached(user, jarId, totalSaved, targetAmount)`. New views: `isGoalReached(user, jarId)` and `goalRemaining(user, jarId)`.

## Product States

The single-page interface conditionally renders four states:

1. **Not connected** — product introduction, wallet connection, and feature cards.
2. **Connected, no active jar** — jar creation form (with the optional savings-goal toggle) and two-step approval flow.
3. **Active, locked jar** — liquid jar visual, second-by-second countdown, progress bar, the 🐷 piggy-savings top-up card with goal progress, and guarded emergency-break flow.
4. **Unlocked jar** — completed jar, congratulations state, and one-click full withdrawal.
5. **Goal reached** — a goal jar that hit its target early: withdraw everything now or wait for maturity and keep earning.

A wallet-free reviewer walkthrough is available at [`/demo`](http://localhost:3000/demo). It uses mock read data and never broadcasts transactions.

## Technical Stack

- Solidity `^0.8.20`
- Next.js 14 App Router
- React 18
- TypeScript in strict mode
- Tailwind CSS 3
- wagmi v2
- viem v2
- RainbowKit v2
- TanStack Query v5
- Arc Mainnet, chain ID `5042`
- Circle-issued USDC, 6 token decimals

The contract has no OpenZeppelin dependency. The front end has no external image dependency; all jar and brand artwork is inline SVG/CSS.

## Smart Contract

- **Contract:** `SavingsJar.sol`
- **Contract Address:** `[PASTE DEPLOYED SAVINGSJAR ADDRESS]`
- **Network:** Arc Mainnet
- **Chain ID:** `5042`
- **RPC:** `https://rpc.mainnet.arc.io`
- **USDC Address:** `0x3600000000000000000000000000000000000000`
- **USDC Decimals:** `6`
- **Block Explorer:** `https://explorer.arc.io`
- **Explorer Link:** `[PASTE EXPLORER CONTRACT LINK]`

Arc uses native USDC for gas at the EVM protocol layer. The ERC-20 USDC handled by this contract uses 6 decimals; the application keeps those units separate.

### Core Contract Rules

- One active jar per wallet.
- Amount must be greater than zero.
- Minimum lock: 86,400 seconds (24 hours).
- Maximum lock: 31,536,000 seconds (365 days).
- Jar names must be non-empty and no longer than 48 bytes.
- Mature withdrawal returns 100%.
- Early break returns 90%; integer-rounded 10% remains as a discipline fee.
- Only the owner can withdraw accumulated discipline fees.

### Security Properties

- Checks-Effects-Interactions on every token exit path.
- Reentrancy protection on create, withdraw, break, and penalty withdrawal flows.
- User state is deleted before an outbound withdrawal interaction.
- Safe ERC-20 wrappers support tokens that return `true` and tokens that return no value.
- Token revert reasons are bubbled to the wallet where available.
- The USDC address is immutable.
- No proxy or upgrade path.
- No pause switch.
- No owner function can touch active saver deposits.
- Discipline fees are derived as `contract USDC balance - total active deposits`, avoiding accounting drift.
- Zero-address validation for USDC and ownership transfer.

The exact elapsed-time percentage is supported by a `jarCreatedAt` sidecar mapping. The required `JarData` structure remains unchanged.

## Repository Structure

```text
arc-savings-jar/
├── app/
│   ├── demo/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AddToJarCard.tsx
│   ├── BreakJarModal.tsx
│   ├── CountdownTimer.tsx
│   ├── CreateJarForm.tsx
│   ├── FundBonusPoolCard.tsx
│   ├── Header.tsx
│   ├── JarDashboard.tsx
│   ├── JarVisual.tsx
│   ├── Landing.tsx
│   ├── Logo.tsx
│   ├── Providers.tsx
│   └── StatusBadge.tsx
├── config/
│   ├── abi/
│   │   ├── erc20.abi.ts
│   │   ├── index.ts
│   │   └── savingsJar.abi.ts
│   ├── contracts.ts
│   └── wagmi.ts
├── contracts/
│   └── SavingsJar.sol
├── hooks/
│   ├── useCountdown.ts
│   └── useSavingsJar.ts
├── lib/
│   ├── format.ts
│   └── types.ts
├── public/
│   └── favicon.svg
├── scripts/
│   ├── compile.mjs
│   ├── deploy.mjs
│   └── verify-deployment.mjs
├── .env.example
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Local Development

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- An EVM wallet for live contract interaction
- A WalletConnect project ID only if the WalletConnect QR option is required

### Install and Run

```bash
git clone <YOUR_REPOSITORY_URL>
cd arc-savings-jar
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Open [http://localhost:3000/demo](http://localhost:3000/demo) to inspect all UI states without a wallet or deployed contract.

### Environment Variables

```dotenv
# Optional: enables the WalletConnect QR connector.
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Required for live SavingsJar reads and writes.
NEXT_PUBLIC_SAVINGS_JAR_ADDRESS=0x...

# mainnet or testnet
NEXT_PUBLIC_TARGET_NETWORK=mainnet
```

Injected wallets—including MetaMask, Rabby, Coinbase Wallet, Phantom, OKX, and Trust Wallet—do not require a WalletConnect project ID.

Contract and USDC addresses have a single source of truth in `config/contracts.ts`. An environment variable can override the SavingsJar address without editing source code.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
```

The completed project passes strict TypeScript checking, ESLint, and a production Next.js build.

The piggy-savings feature is covered by an in-memory-EVM behavioral suite (`.evmtest/goal-jar.test.js`, run with `node .evmtest/goal-jar.test.js`): goal-jar creation rules, bit-by-bit top-ups, goal overshoot rejection, goal-reached early withdrawal, break refusal after the goal, per-deposit-segment bonus/points math, penalty-share rewards preserved across top-ups, matured-jar guard rails, and the four-bucket accounting invariant. Result: **72 passed, 0 failed**.

The contract was also executed against an in-memory EVM with a 75-assertion behavioral suite covering:

- constructor and network constants;
- every `createJar` validation rule;
- approval and balance movement;
- duplicate-jar rejection;
- locked withdrawal rejection;
- 50% elapsed time travel;
- exact 10% early-break accounting;
- odd-unit integer rounding;
- state cleanup;
- maturity withdrawal;
- event payloads;
- owner-only penalty withdrawal;
- penalty/deposit separation; and
- attempted token reentrancy.

Result: **75 passed, 0 failed**.

## Compile the Contract

The repository includes a dependency-light solc-js compiler script:

```bash
npm run compile
```

It compiles `contracts/SavingsJar.sol` and writes:

- `config/abi/savingsJar.abi.ts` — typed, viem-ready ABI;
- `artifacts/SavingsJar.json` — ABI and deployment bytecode.

Compiler settings used by the script:

- Solidity compiler: `0.8.28`
- Optimizer: enabled
- Optimizer runs: `200`
- EVM version: `paris`

The contract source itself remains compatible with Solidity `^0.8.20`.

## Deployment

A viem deployment script is included, so Hardhat and Foundry are not required.

### 1. Test on Arc Testnet

1. Add Arc Testnet to the deployment wallet:
   - Chain ID: `5042002`
   - RPC: `https://rpc.testnet.arc.io`
   - Explorer: `https://explorer.testnet.arc.io`
2. Get testnet USDC from Circle's faucet: `https://faucet.circle.com`.
3. Compile the contract:

```bash
npm run compile
```

4. Dry-run the network and USDC preflight checks:

```bash
npm run deploy:testnet -- --dry-run
```

5. Deploy:

```bash
PRIVATE_KEY=0xYOUR_PRIVATE_KEY npm run deploy:testnet
```

6. Put the output address in `.env.local`:

```dotenv
NEXT_PUBLIC_TARGET_NETWORK=testnet
NEXT_PUBLIC_SAVINGS_JAR_ADDRESS=0xDEPLOYED_ADDRESS
```

7. Verify all live view functions:

```bash
npm run verify -- --network testnet --jar 0xDEPLOYED_ADDRESS
```

### 2. Deploy to Arc Mainnet

1. Fund the deployer with native USDC for Arc gas.
2. Confirm the deployment configuration:
   - Chain ID: `5042`
   - RPC: `https://rpc.mainnet.arc.io`
   - USDC: `0x3600000000000000000000000000000000000000`
3. Run the mainnet preflight without broadcasting:

```bash
npm run deploy:mainnet -- --dry-run
```

4. Deploy:

```bash
PRIVATE_KEY=0xYOUR_PRIVATE_KEY npm run deploy:mainnet
```

The script verifies the RPC chain ID and reads `symbol()` and `decimals()` from the configured USDC address before broadcasting. It aborts if any value is wrong.

5. Copy the contract address into `.env.local`:

```dotenv
NEXT_PUBLIC_TARGET_NETWORK=mainnet
NEXT_PUBLIC_SAVINGS_JAR_ADDRESS=0xDEPLOYED_ADDRESS
```

Alternatively, replace `SAVINGS_JAR_ADDRESS_MAINNET` once in `config/contracts.ts`.

6. Run the post-deployment smoke test:

```bash
npm run verify -- --network mainnet --jar 0xDEPLOYED_ADDRESS
```

Inspect a specific saver as well:

```bash
npm run verify -- \
  --network mainnet \
  --jar 0xDEPLOYED_ADDRESS \
  --user 0xSAVER_ADDRESS
```

7. Verify `SavingsJar.sol` on `https://explorer.arc.io` with:
   - compiler `0.8.28`;
   - optimization enabled;
   - 200 optimizer runs;
   - EVM version `paris`;
   - constructor argument: Arc USDC address.

8. Rebuild and deploy the Next.js front end:

```bash
npm run build
npm run start
```

Never commit a private key. Use a dedicated deployment wallet and a secret manager in CI.

## Front-End Deployment

The app can be deployed to Vercel or any Node.js-compatible host.

### Vercel

1. Import the Git repository.
2. Set:
   - `NEXT_PUBLIC_SAVINGS_JAR_ADDRESS`
   - `NEXT_PUBLIC_TARGET_NETWORK=mainnet`
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if WalletConnect QR support is desired.
3. Use the default commands:
   - Install: `npm install`
   - Build: `npm run build`
4. Deploy.

The application is statically prerendered and performs blockchain reads directly from the browser. There is no database, backend API, admin server, or user-account system.

## Arc Microgrants Submission

> This project was built as a submission for the Arc Microgrants program, demonstrating that Arc Mainnet is the ideal chain for micro-financial applications requiring low-cost, time-sensitive USDC transactions.

The product demonstrates real USDC utility, deterministic time-lock logic, transparent penalty accounting, wallet-native identity, and a clean consumer-fintech interface on Arc.

## Limitations and Responsible Use

- Smart contracts can contain defects even after testing. Obtain an independent audit before encouraging significant deposits.
- The 10% early-exit fee is intentional and irreversible.
- The owner can withdraw accumulated penalties, but cannot withdraw active deposits through any owner-only function.
- The interface displays USDC as USD at a 1:1 nominal value and does not query an external price oracle.
- Users are responsible for preserving wallet access.

## License

MIT
