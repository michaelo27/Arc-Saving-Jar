import type { Metadata } from "next";

import GiftJarPage from "@/components/GiftJarPage";

export const metadata: Metadata = {
  title: "Gift USDC to a Savings Jar | Arc Savings Jar",
  description: "Support a savings goal with a direct USDC gift into an active, locked Arc Savings Jar.",
};

export default function PublicGiftPage({
  params,
}: {
  params: { owner: string; jarId: string; generation: string };
}) {
  return (
    <GiftJarPage
      owner={params.owner}
      jarId={params.jarId}
      generation={params.generation}
    />
  );
}
