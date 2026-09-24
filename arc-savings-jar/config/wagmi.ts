"use client";

import { http, createConfig, type Config } from "wagmi";
/**
 * Deliberately imported from `@wagmi/core` rather than `wagmi/connectors`:
 * the latter's barrel also pulls in the Coinbase *Smart Wallet* SDK
 * (@coinbase/cdp-sdk), which has unresolved optional `@x402/*` peer
 * dependencies and breaks the Next.js/webpack build. Importing from core gives
 * us the generic EIP-1193 `injected` connector, which still discovers the
 * Coinbase Wallet extension and mobile app - we just skip the SDK-based smart
 * account flow, which is not needed for a savings jar.
 */
import { injected, type CreateConnectorFn } from "@wagmi/core";
import { metaMask, walletConnect } from "wagmi/connectors";
import { arc, arcTestnet, type Chain } from "viem/chains";

/**
 * ============================================================================
 *  Arc chain configuration
 * ============================================================================
 *  Arc is Circle's EVM-compatible L1. Its native gas asset is USDC quoted at 18
 *  decimals (like every EVM native currency), while the ERC-20 USDC token that
 *  SavingsJar deposits has 6 decimals. Both facts are handled explicitly in the
 *  UI layer so no math ever mixes the two.
 *
 *  Values below were verified against the live nodes on 2026-09-18:
 *    eth_chainId(mainnet)   -> 0x13b2    (5042)
 *    eth_chainId(testnet)   -> 0x4cef52  (5042002)
 *    USDC.symbol            -> "USDC"
 *    USDC.decimals          -> 6
 *    Multicall3 (0xcA11...CA11) is deployed on both -> batched reads enabled
 *
 *  We start from viem's own `arc` / `arcTestnet` definitions (which include
 *  Multicall3) and layer the naming + explorer URLs from docs.arc.io on top.
 */

export const arcMainnet: Chain = {
  ...arc,
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.mainnet.arc.io",
        "https://rpc.blockdaemon.mainnet.arc.io",
        "https://rpc.drpc.mainnet.arc.io",
        "https://rpc.quicknode.mainnet.arc.io",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
};

export const ARC_TESTNET_EXPLORER_URL = "https://explorer.testnet.arc.io";

export const arcTestnetChain: Chain = {
  ...arcTestnet,
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.testnet.arc.io",
        "https://rpc.testnet.arc.network",
        "https://rpc.blockdaemon.testnet.arc.network",
      ],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: ARC_TESTNET_EXPLORER_URL },
  },
  testnet: true,
};

/** Chains the app supports. Arc Mainnet is first, therefore the default. */
export const chains = [
  arcMainnet,
  arcTestnetChain,
] as const satisfies readonly [Chain, ...Chain[]];

export const ARC_MAINNET_ID = arcMainnet.id;
export const ARC_TESTNET_ID = arcTestnetChain.id;

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------
/**
 * WalletConnect requires a free project id from https://cloud.reown.com.
 * It is OPTIONAL: when absent we simply skip that connector, and every injected
 * wallet (MetaMask, Rabby, Phantom, OKX, Trust, Coinbase ...) keeps working.
 */
export const WALLETCONNECT_PROJECT_ID: string =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const appName = "Arc Savings Jar";
export const appDescription =
  "Lock your USDC. Grow your discipline. Powered by Arc.";

function buildConnectors(): CreateConnectorFn[] {
  const connectors: CreateConnectorFn[] = [
    // MetaMask SDK connector: desktop extension + mobile deep link.
    metaMask({ dappMetadata: { name: appName, url: "https://arc.io" } }),
    // Any EIP-1193 wallet that injects itself: Coinbase Wallet, Rabby,
    // Phantom, OKX, Trust, Binance Web3 Wallet, ...
    injected({ shimDisconnect: true }),
  ];

  if (WALLETCONNECT_PROJECT_ID.length > 0) {
    connectors.push(
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
        showQrModal: true,
        metadata: {
          name: appName,
          description: appDescription,
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : "https://arc.io",
          icons: [],
        },
      }),
    );
  }

  return connectors;
}

export const wagmiConfig: Config = createConfig({
  chains,
  connectors: buildConnectors(),
  transports: {
    [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0], {
      timeout: 20_000,
      retryCount: 2,
    }),
    [arcTestnetChain.id]: http(arcTestnetChain.rpcUrls.default.http[0], {
      timeout: 20_000,
      retryCount: 2,
    }),
  },
  /**
   * Arc produces blocks in well under a second, but polling the public RPC that
   * aggressively is rude (and rate-limited). 3s keeps the UI feeling live while
   * the on-screen countdown ticks locally every second regardless.
   */
  pollingInterval: 3_000,
  batch: { multicall: true },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
