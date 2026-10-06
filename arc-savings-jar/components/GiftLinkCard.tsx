"use client";

import { useCallback, useEffect, useState } from "react";
import { useReadContract } from "wagmi";

import { savingsJarAbi } from "@/config/abi";
import { IS_CONTRACT_DEPLOYED, SAVINGS_JAR_ADDRESS, TARGET_NETWORK } from "@/config/contracts";
import { ARC_MAINNET_ID, ARC_TESTNET_ID } from "@/config/wagmi";
import { formatUsd } from "@/lib/format";

const targetChainId = TARGET_NETWORK === "testnet" ? ARC_TESTNET_ID : ARC_MAINNET_ID;

export interface GiftLinkCardProps {
  ownerAddress: `0x${string}` | undefined;
  jarId: number | null;
  jarName: string;
  jarAmount: bigint;
  targetAmount: bigint;
  /** Goal jars that have reached their target no longer accept contributions. */
  canReceiveGift: boolean;
}

/** Let a jar owner create a shareable link to the gift page for this jar. */
export default function GiftLinkCard({
  ownerAddress,
  jarId,
  jarName,
  jarAmount,
  targetAmount,
  canReceiveGift,
}: GiftLinkCardProps) {
  const [giftUrl, setGiftUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const generationQuery = useReadContract({
    address: SAVINGS_JAR_ADDRESS,
    abi: savingsJarAbi,
    functionName: "jarGeneration",
    args: ownerAddress && jarId !== null ? [ownerAddress, BigInt(jarId)] : undefined,
    chainId: targetChainId,
    query: {
      enabled: IS_CONTRACT_DEPLOYED && Boolean(ownerAddress) && jarId !== null,
      refetchInterval: 15_000,
    },
  });
  const generation = generationQuery.data;

  useEffect(() => {
    setGiftUrl("");
    setFeedback("");
  }, [generation, jarId, ownerAddress]);

  const remaining = targetAmount > jarAmount ? targetAmount - jarAmount : 0n;

  const generateLink = useCallback(async () => {
    if (!ownerAddress || jarId === null || generation === undefined || generation === 0n) {
      setFeedback("The jar version is still loading. Please try again in a moment.");
      return;
    }
    const url = new URL(`/gift/${ownerAddress}/${jarId}/${generation}`, window.location.origin).toString();
    setGiftUrl(url);
    setFeedback("Link ready.");

    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Gift link copied. Share it with your supporters.");
    } catch {
      setFeedback("Link ready. Copy it from the field below to share it.");
    }
  }, [generation, jarId, ownerAddress]);

  const copyLink = useCallback(async () => {
    if (!giftUrl) return;
    try {
      await navigator.clipboard.writeText(giftUrl);
      setFeedback("Copied to clipboard.");
    } catch {
      setFeedback("Select and copy the link from the field.");
    }
  }, [giftUrl]);

  const shareLink = useCallback(async () => {
    if (!giftUrl || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: `Gift USDC to ${jarName || "this savings jar"}`,
        text: `Support ${jarName || "this savings goal"} with a USDC gift.`,
        url: giftUrl,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setFeedback("Sharing was unavailable. Copy the link instead.");
      }
    }
  }, [giftUrl, jarName]);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <section className="mt-5 w-full max-w-md rounded-2xl border border-accent/25 bg-accent/5 p-5 text-left">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-lg text-accent">
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">Invite someone to gift this jar</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Share a link for friends to chip in toward a goal or send a creator a tip. Gifts go
            straight into your jar and can’t be reclaimed by the sender; only you can withdraw
            under the jar’s rules.
          </p>
        </div>
      </div>

      {targetAmount > 0n ? (
        <p className="mt-3 text-xs text-muted">
          {canReceiveGift ? (
            <>
              {formatUsd(remaining)} remains to reach the target.
            </>
          ) : (
            <>This jar has reached its target and is no longer accepting gifts.</>
          )}
        </p>
      ) : null}

      {canReceiveGift ? (
        <>
          {generationQuery.isError ? (
            <p className="mt-3 text-xs text-danger" role="status">
              Couldn’t load this jar’s secure link version. Refresh the page and try again.
            </p>
          ) : null}
          <button
            type="button"
            onClick={generateLink}
            disabled={generationQuery.isLoading || generationQuery.isError || generation === undefined || generation === 0n}
            className="btn-secondary mt-4 w-full"
          >
            {generationQuery.isLoading
              ? "Preparing secure gift link…"
              : generationQuery.isError || generation === undefined || generation === 0n
                ? "Gift link unavailable"
                : giftUrl
                  ? "Copy gift link"
                  : "Generate gift link"}
          </button>

          {giftUrl ? (
            <div className="mt-3 space-y-2">
              <label htmlFor="gift-link" className="sr-only">
                Shareable gift link
              </label>
              <input
                id="gift-link"
                className="input font-mono text-xs"
                value={giftUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                aria-describedby="gift-link-feedback"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="btn-primary flex-1 !py-2.5">
                  Copy link
                </button>
                {canShare ? (
                  <button type="button" onClick={shareLink} className="btn-ghost flex-1 !py-2.5">
                    Share…
                  </button>
                ) : null}
              </div>
              <p id="gift-link-feedback" role="status" aria-live="polite" className="min-h-4 text-xs text-accent">
                {feedback}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
          This jar cannot accept a gift right now.
        </p>
      )}
    </section>
  );
}
