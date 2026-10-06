"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, isAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import Header from "@/components/Header";
import { erc20Abi, savingsJarAbi } from "@/config/abi";
import {
  EXPLORER_URL,
  IS_CONTRACT_DEPLOYED,
  SAVINGS_JAR_ADDRESS,
  TARGET_NETWORK,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/config/contracts";
import { ARC_MAINNET_ID, ARC_TESTNET_ID, arcMainnet, arcTestnetChain, wagmiConfig } from "@/config/wagmi";
import { formatContractError, formatUsd, formatUsdc, explorerTxUrl, truncateAddress } from "@/lib/format";
import { parseUsdc } from "@/hooks/useSavingsJar";

type GiftPhase = "idle" | "approving" | "approval-confirming" | "gifting" | "gift-confirming" | "success" | "error";

const MAX_JARS_PER_WALLET = 10n;
const targetChain = TARGET_NETWORK === "testnet" ? arcTestnetChain : arcMainnet;
const targetChainId = TARGET_NETWORK === "testnet" ? ARC_TESTNET_ID : ARC_MAINNET_ID;

export interface GiftJarPageProps {
  owner: string;
  jarId: string;
  generation: string;
}

/** Public, read-only jar details plus a donor-funded gift flow for one jar. */
export default function GiftJarPage({ owner, jarId, generation }: GiftJarPageProps) {
  const ownerAddress = isAddress(owner) ? owner : undefined;
  const parsedJarId = /^(0|[1-9]\d*)$/.test(jarId) ? BigInt(jarId) : null;
  const validJarId = parsedJarId !== null && parsedJarId < MAX_JARS_PER_WALLET ? parsedJarId : null;
  const parsedGeneration = /^(0|[1-9]\d*)$/.test(generation) ? BigInt(generation) : null;
  const validLink = Boolean(ownerAddress && validJarId !== null && parsedGeneration !== null && parsedGeneration > 0n);

  const queryClient = useQueryClient();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWalletPending } = useWriteContract();

  const [amountInput, setAmountInput] = useState("");
  const [phase, setPhase] = useState<GiftPhase>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [giftTxHash, setGiftTxHash] = useState<`0x${string}` | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1_000));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const jarQuery = useReadContract({
    address: SAVINGS_JAR_ADDRESS,
    abi: savingsJarAbi,
    functionName: "getJar",
    args: ownerAddress && validJarId !== null ? [ownerAddress, validJarId] : undefined,
    chainId: targetChainId,
    query: {
      enabled: IS_CONTRACT_DEPLOYED && validLink,
      refetchInterval: 8_000,
    },
  });

  const generationQuery = useReadContract({
    address: SAVINGS_JAR_ADDRESS,
    abi: savingsJarAbi,
    functionName: "jarGeneration",
    args: ownerAddress && validJarId !== null ? [ownerAddress, validJarId] : undefined,
    chainId: targetChainId,
    query: { enabled: IS_CONTRACT_DEPLOYED && validLink, refetchInterval: 8_000 },
  });

  const balanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: {
      enabled: IS_CONTRACT_DEPLOYED && isConnected && Boolean(address),
      refetchInterval: 8_000,
    },
  });

  const allowanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, SAVINGS_JAR_ADDRESS] : undefined,
    chainId: targetChainId,
    query: {
      enabled: IS_CONTRACT_DEPLOYED && isConnected && Boolean(address),
      refetchInterval: 8_000,
    },
  });

  const parsedAmount = useMemo(() => {
    if (amountInput.trim().length === 0) return { value: 0n, error: null as string | null };
    try {
      return { value: parseUsdc(amountInput), error: null as string | null };
    } catch (cause) {
      return {
        value: 0n,
        error: cause instanceof Error ? cause.message : "Enter a valid USDC amount.",
      };
    }
  }, [amountInput]);

  const jar = jarQuery.data;
  const amount = parsedAmount.value;
  const balance = balanceQuery.data ?? 0n;
  const allowance = allowanceQuery.data ?? 0n;
  const hasGoal = Boolean(jar && jar.targetAmount > 0n);
  const isGoalReached = Boolean(jar && hasGoal && jar.amount >= jar.targetAmount);
  const remainingToGoal = jar && hasGoal && jar.amount < jar.targetAmount
    ? jar.targetAmount - jar.amount
    : 0n;
  const goalProgressPercent = jar && hasGoal
    ? Math.min(100, Number((jar.amount * 10_000n) / jar.targetAmount) / 100)
    : 0;
  const isMatured = Boolean(jar && now > 0 && now >= Number(jar.unlockTime));
  const isStaleLink = Boolean(
    parsedGeneration !== null &&
    generationQuery.data !== undefined &&
    generationQuery.data !== parsedGeneration,
  );
  const generationMatches = parsedGeneration !== null && generationQuery.data === parsedGeneration;
  const canReceiveGift = Boolean(jar && jar.isActive && !isMatured && !isGoalReached && !isStaleLink);
  const exceedsGoal = hasGoal && amount > remainingToGoal;
  const exceedsBalance = amount > 0n && balanceQuery.data !== undefined && amount > balance;
  const amountError = parsedAmount.error ??
    (exceedsGoal
      ? "That amount would take this jar past its goal."
      : exceedsBalance
        ? "That amount is greater than your USDC balance."
        : null);
  const isWrongNetwork = isConnected && chainId !== targetChainId;
  const isBusy = isWalletPending || phase === "approving" || phase === "approval-confirming" || phase === "gifting" || phase === "gift-confirming";
  const canSubmit = Boolean(
    IS_CONTRACT_DEPLOYED &&
    canReceiveGift &&
    generationMatches &&
    isConnected &&
    !isWrongNetwork &&
    amount > 0n &&
    !amountError &&
    balanceQuery.data !== undefined &&
    allowanceQuery.data !== undefined &&
    !isBusy,
  );

  const sendGift = useCallback(async () => {
    if (
      !ownerAddress ||
      validJarId === null ||
      parsedGeneration === null ||
      !generationMatches ||
      !jar ||
      !canReceiveGift ||
      !address ||
      !canSubmit
    ) return;
    setError(null);
    setGiftTxHash(null);

    try {
      if (allowance < amount) {
        setPhase("approving");
        setMessage(`Approve ${formatUsdc(amount)} in your wallet…`);
        const approvalHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [SAVINGS_JAR_ADDRESS, amount],
          chainId: targetChainId,
        });
        setPhase("approval-confirming");
        setMessage("Waiting for the USDC approval to confirm…");
        const approvalReceipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: approvalHash,
          chainId: targetChainId,
        });
        if (approvalReceipt.status !== "success") throw new Error("USDC approval did not confirm.");
      }

      setPhase("gifting");
      setMessage("Confirm the gift transaction in your wallet…");
      const giftHash = await writeContractAsync({
        address: SAVINGS_JAR_ADDRESS,
        abi: savingsJarAbi,
        functionName: "giftToJar",
        args: [ownerAddress, validJarId, amount, parsedGeneration],
        chainId: targetChainId,
      });
      setGiftTxHash(giftHash);
      setPhase("gift-confirming");
      setMessage("Gift sent. Waiting for the transaction to confirm…");
      const giftReceipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: giftHash,
        chainId: targetChainId,
      });
      if (giftReceipt.status !== "success") throw new Error("The gift transaction did not confirm.");

      setPhase("success");
      setMessage(`Your ${formatUsdc(amount)} gift is now in ${jar.jarName || "the savings jar"}.`);
      setAmountInput("");
      await Promise.all([
        jarQuery.refetch(),
        balanceQuery.refetch(),
        allowanceQuery.refetch(),
        queryClient.invalidateQueries(),
      ]);
    } catch (cause) {
      console.error("[GiftJarPage] gift failed:", cause);
      setPhase("error");
      setMessage("");
      setError(formatContractError(cause));
    }
  }, [
    address,
    allowance,
    allowanceQuery,
    amount,
    balanceQuery,
    canReceiveGift,
    canSubmit,
    generationMatches,
    jar,
    jarQuery,
    ownerAddress,
    parsedGeneration,
    queryClient,
    validJarId,
    writeContractAsync,
  ]);

  const handleSwitchNetwork = useCallback(async () => {
    setError(null);
    try {
      await switchChain({ chainId: targetChainId });
    } catch (cause) {
      setError(formatContractError(cause));
    }
  }, [switchChain]);

  const unlockDate = jar ? new Date(Number(jar.unlockTime) * 1_000) : null;

  return (
    <main className="relative flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        <a href="/" className="text-sm text-muted transition hover:text-accent">← Back to Arc Savings Jar</a>

        <section className="card mt-5 p-5 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-xl">🎁</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Community support</p>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Gift USDC into a savings jar</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Help someone move a real goal forward. Choose a gift amount and send it directly into their jar.
              </p>
            </div>
          </div>

          {!validLink ? (
            <Notice tone="danger">This gift link is incomplete or invalid. Ask the jar owner to create a fresh link.</Notice>
          ) : !IS_CONTRACT_DEPLOYED ? (
            <Notice tone="gold">
              Gift contributions are not available yet because a Savings Jar contract address has not been configured for {targetChain.name}.
            </Notice>
          ) : jarQuery.isLoading || generationQuery.isLoading ? (
            <div className="rounded-2xl border border-navy-500 bg-navy-900/60 p-5 text-sm text-muted" role="status">
              Loading the jar details from {targetChain.name}…
            </div>
          ) : jarQuery.isError || generationQuery.isError ? (
            <Notice tone="danger">
              We couldn’t verify this jar link. It may be invalid, or the contract may need the latest gift-link support.
            </Notice>
          ) : isStaleLink ? (
            <Notice tone="danger">
              This gift link is for an older jar that has since closed. Ask the owner to generate a fresh link.
            </Notice>
          ) : !jar || !jar.isActive ? (
            <Notice tone="gold">This jar is no longer active and can’t receive gifts.</Notice>
          ) : (
            <>
              <div className="rounded-2xl border border-navy-500 bg-navy-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Jar owner</p>
                    <p className="mt-1 font-mono text-sm text-white" title={ownerAddress}>{truncateAddress(ownerAddress)}</p>
                  </div>
                  <span className="pill">{targetChain.name}</span>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">{jar.jarName || `Jar ${(validJarId ?? 0n) + 1n}`}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Metric label="Saved so far" value={`${formatUsd(jar.amount)} USDC`} />
                  {hasGoal ? (
                    <Metric label="Savings goal" value={`${formatUsd(jar.targetAmount)} USDC`} />
                  ) : (
                    <Metric label="Jar type" value="Time-locked jar" />
                  )}
                </div>
                {hasGoal ? (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>Goal progress</span>
                      <span>{formatUsd(remainingToGoal)} USDC to go</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-navy-950" role="progressbar" aria-valuenow={Math.round(goalProgressPercent)} aria-valuemin={0} aria-valuemax={100} aria-label="Savings goal progress">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${goalProgressPercent}%` }} />
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-xs text-muted">
                  {isMatured
                    ? "The jar has reached its unlock time. It can no longer receive gifts."
                    : isGoalReached
                      ? "The savings goal is already reached, so the jar can’t accept another gift."
                      : unlockDate
                        ? `This jar accepts gifts until ${unlockDate.toLocaleString()}.`
                        : "This jar accepts gifts while it is active and locked."}
                </p>
              </div>

              {!canReceiveGift ? (
                <Notice tone="gold" className="mt-5">This jar is not accepting gifts right now.</Notice>
              ) : (
                <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/5 p-5">
                  <h2 className="text-base font-semibold text-white">Send a gift</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Your USDC becomes part of {jar.jarName || "this jar"}. The gift is irreversible; only the jar owner can withdraw it under the jar’s rules.
                  </p>

                  {!isConnected ? (
                    <div className="mt-5 flex flex-col items-start gap-3">
                      <p className="text-sm text-muted">Connect a wallet on {targetChain.name} to choose an amount and contribute.</p>
                      <ConnectButton />
                    </div>
                  ) : isWrongNetwork ? (
                    <div className="mt-5">
                      <Notice tone="gold">Your wallet is on chain {chainId}. Switch to {targetChain.name} ({targetChainId}) to continue.</Notice>
                      <button type="button" onClick={handleSwitchNetwork} disabled={isSwitchingChain} className="btn-gold mt-3">
                        {isSwitchingChain ? "Switching network…" : `Switch to ${targetChain.name}`}
                      </button>
                    </div>
                  ) : (
                    <form
                      className="mt-5 space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendGift();
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span>Connected wallet: <span className="font-mono text-white">{truncateAddress(address)}</span></span>
                        <span>Balance: {balanceQuery.isLoading ? "Loading…" : formatUsdc(balance)}</span>
                      </div>
                      <div>
                        <label htmlFor="gift-amount" className="label">Gift amount (USDC)</label>
                        <input
                          id="gift-amount"
                          className="input mt-2"
                          type="number"
                          inputMode="decimal"
                          min="0.000001"
                          step="0.000001"
                          max={hasGoal ? formatUnits(remainingToGoal, USDC_DECIMALS) : undefined}
                          placeholder="25.00"
                          value={amountInput}
                          onChange={(event) => {
                            setAmountInput(event.target.value);
                            setError(null);
                            if (phase === "error" || phase === "success") {
                              setPhase("idle");
                              setMessage("");
                            }
                          }}
                          aria-invalid={Boolean(amountError)}
                          aria-describedby={amountError ? "gift-amount-error" : "gift-amount-help"}
                          disabled={isBusy || !canReceiveGift}
                        />
                        {amountError ? (
                          <p id="gift-amount-error" className="mt-1.5 text-xs text-danger">{amountError}</p>
                        ) : (
                          <p id="gift-amount-help" className="mt-1.5 text-xs text-muted">
                            {hasGoal ? `Up to ${formatUsdc(remainingToGoal)} can be added before the goal is reached.` : "Choose any positive amount; this jar has no target cap."}
                          </p>
                        )}
                      </div>

                      {error ? <Notice tone="danger">{error}</Notice> : null}
                      {message ? (
                        <div className={`rounded-xl border px-3 py-2 text-xs ${phase === "success" ? "border-success/30 bg-success/10 text-success" : phase === "error" ? "border-danger/30 bg-danger/10 text-danger" : "border-accent/30 bg-accent/10 text-accent"}`} role="status" aria-live="polite">
                          {message}
                        </div>
                      ) : null}
                      {giftTxHash ? (
                        <a className="inline-flex text-xs text-accent underline-offset-4 hover:underline" href={explorerTxUrl(EXPLORER_URL, giftTxHash)} target="_blank" rel="noreferrer noopener">
                          View gift transaction
                        </a>
                      ) : null}

                      <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
                        {phase === "approving" ? "Approve USDC in your wallet…" :
                          phase === "approval-confirming" ? "Confirming approval…" :
                            phase === "gifting" ? "Confirm gift in your wallet…" :
                              phase === "gift-confirming" ? "Confirming gift…" :
                                phase === "success" ? "Gift sent ✓" :
                                  allowance < amount && amount > 0n
                                    ? `Approve, then gift ${formatUsdc(amount)}`
                                    : amount > 0n
                                      ? `Gift ${formatUsdc(amount)}`
                                      : "Enter a gift amount"}
                      </button>
                      <p className="text-center text-[11px] leading-relaxed text-muted">
                        If approval is needed, your wallet will ask you to approve USDC first and then confirm the gift transaction.
                      </p>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          <p className="mt-6 text-xs leading-relaxed text-muted">
            A gift is a contribution to the jar, not a transfer to the owner’s wallet. Please verify the jar owner and amount before confirming in your wallet.
          </p>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-navy-500 bg-navy-800/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
  className = "",
}: {
  tone: "gold" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const styles = tone === "gold"
    ? "border-gold/40 bg-gold/10 text-gold"
    : "border-danger/40 bg-danger/10 text-danger";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles} ${className}`} role="status">{children}</div>;
}
