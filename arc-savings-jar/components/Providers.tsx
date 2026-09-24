"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";

import "@rainbow-me/rainbowkit/styles.css";

import { appName, arcMainnet, wagmiConfig } from "@/config/wagmi";

/**
 * Client-side provider tree:
 *   WagmiProvider -> QueryClientProvider -> RainbowKitProvider
 *
 * The QueryClient is created once per browser session (React 18 StrictMode
 * double-invokes render, so a bare `new QueryClient()` in module scope would
 * be shared across hot reloads and leak cache between renders).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are cheap to repeat and stale data is worse than a
            // refetch, so: no caching, retry once, refocus refetch off
            // (wagmi polls on an interval already).
            staleTime: 0,
            gcTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={arcMainnet}
          showRecentTransactions
          appInfo={{ appName, learnMoreUrl: "https://docs.arc.io" }}
          modalSize="compact"
          coolMode
          theme={darkTheme({
            accentColor: "#00D4FF",
            accentColorForeground: "#0A0F1E",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default Providers;
