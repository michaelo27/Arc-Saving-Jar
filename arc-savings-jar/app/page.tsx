"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";

import Header from "@/components/Header";
import JarDashboard from "@/components/JarDashboard";
import Landing from "@/components/Landing";
import { useSavingsJar } from "@/hooks/useSavingsJar";

/**
 * Single page app. The four UI states from the spec:
 *
 *   STATE 1  not connected                -> <Landing />
 *   STATE 2  connected, no active jar     -> <CreateJarForm />
 *   STATE 3  connected, jar locked        -> jar + countdown + break flow
 *   STATE 4  connected, jar matured       -> congratulations + withdraw
 *
 * STATE 1 is decided by `useAccount` so a visitor who has never connected does
 * not pay for any contract reads. STATES 2-4 all live in <JarDashboard />,
 * which is mounted once and switches internally - that keeps the hook order
 * stable across state transitions (no remount, no lost tx status).
 */
export default function Home() {
  const { isConnected, isConnecting } = useAccount();
  const jar = useSavingsJar();

  const showLanding = !isConnected && !isConnecting;

  const uiState = showLanding
    ? "1 - not connected"
    : jar.isJarUnlocked
      ? "4 - jar unlocked"
      : jar.isJarActive
        ? "3 - jar locked"
        : "2 - no active jar";

  // Debug aid: log once per state change, client-side only (keeps `next build`
  // output clean - the prerender pass would otherwise print this).
  useEffect(() => {
    console.log("[page] state ->", uiState, {
      address: jar.address,
      chainId: jar.chainId,
      jarActive: jar.isJarActive,
      jarUnlocked: jar.isJarUnlocked,
      contractDeployed: jar.isContractDeployed,
    });
  }, [uiState, jar.address, jar.chainId, jar.isJarActive, jar.isJarUnlocked, jar.isContractDeployed]);

  return (
    <main className="relative flex min-h-screen flex-col">
      <Header />

      {showLanding ? (
        <Landing />
      ) : (
        <div className="flex-1">
          <JarDashboard jar={jar} />
        </div>
      )}
    </main>
  );
}
