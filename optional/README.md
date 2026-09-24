# Arc Savings Jar 🫙

> **Lock your USDC. Grow your discipline. Powered by Arc.**

Arc Savings Jar is a non-custodial savings mini-app on Arc Mainnet. A saver deposits USDC into a personal on-chain jar, chooses a lock between 24 hours and 365 days, and receives the full deposit back after the lock expires.

The application is intentionally small, understandable, and useful: one wallet, several named jars, and three ways a jar that runs to maturity earns more than it put in.

## What It Is

Arc Savings Jar is a decentralized time-locked savings application built for Circle's EVM-compatible Arc blockchain. Funds are held by an immutable smart contract rather than by a company, administrator, or server.

Each wallet can hold up to 10 active jars at once. For every jar the saver chooses the amount, lock duration, and name; the contract enforces each deadline on-chain. A jar that reaches maturity (never broken early) can also earn a reward share, a time bonus, and points - see "Incentives" below.

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

## Product States

The single-page interface conditionally renders four states:

1. **Not connected** — product introduction, wallet connection, and feature cards.
2. **Connected, no active jar** — jar creation form and two-step approval flow.
3. **Active, locked jar** — liquid jar visual, second-by-second countdown, progress bar, and guarded emergency-break flow.
4. **Unlocked jar** — completed jar, congratulations state, and one-click full withdrawal.

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

- Up to 10 active jars per wallet (`MAX_JARS_PER_WALLET`); each has its own name, amount, and lock.
- `withdrawJar(jarId)` and `breakJar(jarId)` act on one jar. Closing a jar frees its slot, and the next `createJar` reuses the first free slot.
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

Each jar stores its own `createdAt` timestamp inside `JarData`, which gives the interface the exact elapsed-time percentage after a cold page load.

## Repository Structure

```text
arc-savings-jar/
├── app/
│   ├── demo/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── BreakJarModal.tsx
│   ├── CountdownTimer.tsx
│   ├── CreateJarForm.tsx
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

Run all three before every release. This revision (multi-jar + incentives) is newer than the 75-assertion behavioral suite described in earlier revisions of this README - treat that result as covering the single-jar, no-incentives contract only. Re-test on Arc Testnet with two or more wallets before mainnet: create several jars, break one (confirm the reward split lands on the *other* active jars, not the one that broke), let one mature and withdraw it (confirm reward + bonus + points all arrive), fund the bonus pool, check the 10-jar limit, and sweep owner fees.

## Incentives

Three mechanisms reward a jar that reaches maturity. All three pay out only on
`withdrawJar` - breaking early (`breakJar`) forfeits every one of them, which
is what keeps "discipline fee" meaningful.

1. **Reward share.** Every time a jar is broken early, 80% of its 10% penalty
   (8% of that jar's amount) is added to a reward pool and split, exactly
   proportional to deposit size, among every jar still open at that moment.
   The remaining 20% goes to the protocol (`ownerFeesAccrued`, swept with
   `withdrawPenalties()`). This is self-funding: nothing is paid out that
   wasn't first paid in by someone who broke a jar early. Uses the standard
   "reward accumulator" pattern (`accRewardPerShare`), so the split needs no
   loop over other users' jars - `createJar` sets a `rewardDebt` baseline,
   and `pendingReward(user, jarId)` reads the current amount owed at any time.

2. **Time bonus.** A simple-interest annual rate (`bonusAprBps`, 5% by
   default, owner-adjustable up to a 20% ceiling) on the amount held, for the
   seconds actually held. Paid from `bonusPoolBalance`, which anyone can top
   up with `fundBonusPool()` - this one is *not* self-funding, it needs real
   USDC behind it. The payout is always capped at whatever the pool still
   holds, so the contract can never go insolvent over this bonus.
   `previewBonus(user, jarId)` shows the live estimate.

3. **Points.** Every mature withdrawal earns non-transferable points, roughly
   "USDC held x days held" (100 USDC held for 10 days = 1,000 points), tracked
   forever in `points(address)`. `getTier(address)` turns a point total into
   Bronze / Silver (1,000) / Gold (10,000) / Platinum (50,000). Points cost
   the contract nothing - they are pure bookkeeping.

**Accounting.** With three destinations for USDC now sharing one contract
balance, each is tracked in its own explicit variable rather than derived from
`balance - deposits` (the old approach for the single-fee version). The
invariant, checked by `getAccountingSummary()` and by `npm run verify`:

```
balance == totalActiveDeposits + ownerFeesAccrued + rewardPoolBalance + bonusPoolBalance
```

One consequence worth knowing: USDC sent to the contract by any route other
than `createJar`, `breakJar`, or `fundBonusPool` (a stray direct transfer,
say) is not counted in any bucket above and is not claimable by the owner or
anyone else - it just sits as inert slack no function reads.

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
