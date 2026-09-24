import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import Providers from "@/components/Providers";

import "./globals.css";

/**
 * Inter is fetched and self-hosted by next/font at build time, so the running
 * app never depends on a third-party CDN at request time. `--font-inter` is
 * wired into tailwind.config.ts -> theme.extend.fontFamily.sans.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const TITLE = "Arc Savings Jar 🫙 - Lock your USDC. Grow your discipline.";
const DESCRIPTION =
  "A non-custodial, time-locked USDC savings jar on Arc Mainnet. Deposit any amount, lock it for 24 hours to 365 days, and withdraw in one click when the lock expires. Built for the Arc Microgrants program.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Arc Savings Jar",
  keywords: [
    "Arc",
    "Arc Mainnet",
    "USDC",
    "savings",
    "time lock",
    "stablecoin",
    "Circle",
    "Web3",
    "dApp",
  ],
  authors: [{ name: "Arc Savings Jar" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Arc Savings Jar",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0F1E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="app-bg min-h-screen bg-navy font-sans text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
