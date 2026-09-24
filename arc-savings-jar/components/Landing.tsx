"use client";

import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import Logo from "@/components/Logo";
import { EXPLORER_URL } from "@/config/contracts";

/**
 * STATE 1 - "Not Connected".
 * Hero jar mark, tagline, the big Connect Wallet button and the three feature
 * cards from the spec.
 */
export default function Landing() {
  const { openConnectModal } = useConnectModal();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-20 pt-14 text-center sm:pt-20">
      {/* ------------------------------------------------------------- hero */}
      <div className="animate-fade-up">
        <HeroJar />
      </div>

      <h1 className="mt-8 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Arc Savings Jar
      </h1>

      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
        Lock your USDC. Build discipline.{" "}
        <span className="text-accent">Powered by Arc.</span>
      </p>

      <button
        type="button"
        onClick={() => {
          console.log("[Landing] Connect Wallet clicked");
          openConnectModal?.();
        }}
        className="btn-primary mt-9 !px-9 !py-4 !text-base"
      >
        <WalletIcon />
        Connect Wallet
      </button>

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted/70">
        Your keys. Your jar. Your rules.
      </p>

      <Link
        href="/demo"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-navy-500 px-3.5 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent"
      >
        Just look around - preview the UI without a wallet
        <span aria-hidden="true">→</span>
      </Link>

      {/* ---------------------------------------------------- feature cards */}
      <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
        <FeatureCard
          title="Time-Locked"
          body="Your funds are locked until your chosen date. No exceptions."
          icon={<LockIcon />}
        />
        <FeatureCard
          title="Non-Custodial"
          body="Only you can access your jar. Not even we can touch it."
          icon={<ShieldIcon />}
        />
        <FeatureCard
          title="Powered by Arc"
          body="Fast, cheap transactions on Arc Mainnet - gas is paid in USDC."
          icon={<ZapIcon />}
        />
      </div>

      {/* ---------------------------------------------------------- footer */}
      <footer className="mt-16 flex w-full flex-col items-center gap-2 border-t border-navy-500/70 pt-8 text-xs text-muted/70">
        <Logo size={22} muted />
        <p>
          SavingsJar.sol · USDC · Arc Mainnet (chainId 5042) ·{" "}
          <a
            href={EXPLORER_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent/80 underline-offset-4 hover:underline"
          >
            explorer
          </a>
        </p>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FeatureCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card group p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent transition group-hover:bg-accent/20">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/** Large decorative jar for the hero. Pure inline SVG, gently animated. */
function HeroJar() {
  return (
    <div className="relative mx-auto w-[190px] sm:w-[230px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-full bg-accent/15 blur-3xl"
      />
      <svg viewBox="0 0 200 240" className="relative w-full" role="img" aria-label="Arc Savings Jar">
        <defs>
          <linearGradient id="hero-liquid" x1="100" y1="90" x2="100" y2="215" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D4FF" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="#0091C2" stopOpacity="0.92" />
            <stop offset="1" stopColor="#0B4C7A" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="hero-lid" x1="100" y1="8" x2="100" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3A4A73" />
            <stop offset="1" stopColor="#1B2440" />
          </linearGradient>
          <clipPath id="hero-clip">
            <path d="M56 40h88v16c26 8 34 24 34 42v104c0 16-11 26-28 26H50c-17 0-28-10-28-26V98c0-18 8-34 34-42V40Z" />
          </clipPath>
        </defs>

        {/* liquid + coins */}
        <g clipPath="url(#hero-clip)">
          <rect x="0" y="56" width="200" height="180" fill="#0E1730" />
          <rect x="0" y="118" width="200" height="118" fill="url(#hero-liquid)" />
          <g className="animate-jar-wave" opacity="0.5">
            <path
              d="M-100 118c25-7 50-7 75 0s50 7 75 0 50-7 75 0 50 7 75 0v124H-100V118Z"
              fill="#00D4FF"
            />
          </g>
          {/* settled coins */}
          <g opacity="0.95">
            <Coin cx={70} cy={205} r={13} />
            <Coin cx={104} cy={212} r={13} />
            <Coin cx={138} cy={203} r={13} />
            <Coin cx={88} cy={182} r={13} />
            <Coin cx={122} cy={186} r={13} />
          </g>
          {/* falling coin */}
          <g className="animate-fade-up">
            <Coin cx={100} cy={138} r={11} />
          </g>
          <rect x="42" y="70" width="9" height="128" rx="4.5" fill="#FFFFFF" fillOpacity="0.10" />
        </g>

        {/* glass + lid */}
        <path
          d="M56 40h88v16c26 8 34 24 34 42v104c0 16-11 26-28 26H50c-17 0-28-10-28-26V98c0-18 8-34 34-42V40Z"
          fill="none"
          stroke="#A0AEC0"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="46" y="8" width="108" height="24" rx="8" fill="url(#hero-lid)" stroke="#A0AEC0" strokeOpacity="0.45" strokeWidth="2" />
        <rect x="52" y="28" width="96" height="14" rx="6" fill="#141D38" stroke="#A0AEC0" strokeOpacity="0.35" strokeWidth="2" />
        <g stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round">
          <line x1="66" y1="13" x2="66" y2="27" />
          <line x1="86" y1="13" x2="86" y2="27" />
          <line x1="106" y1="13" x2="106" y2="27" />
          <line x1="126" y1="13" x2="126" y2="27" />
        </g>
      </svg>
    </div>
  );
}

function Coin({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#FFB800" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0A0F1E" strokeOpacity="0.25" strokeWidth="1.5" />
      <path
        d={`M${cx} ${cy - r * 0.45}v${r * 0.9}M${cx - r * 0.32} ${cy - r * 0.18}h${r * 0.64}M${cx - r * 0.32} ${cy + r * 0.2}h${r * 0.64}`}
        stroke="#0A0F1E"
        strokeOpacity="0.6"
        strokeWidth={Math.max(1.4, r * 0.13)}
        strokeLinecap="round"
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

const ICON = {
  className: "h-5 w-5",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function LockIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3l7 3v5.5c0 4.4-2.9 8.3-7 9.5-4.1-1.2-7-5.1-7-9.5V6l7-3Z" />
      <path d="m9.2 12.1 2 2 3.6-3.9" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg {...ICON}>
      <path d="M13.5 3 5 13.4h5.2L9.9 21 19 10.4h-5.4L13.5 3Z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg {...ICON} className="h-5 w-5">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M16.5 13.5h1.8" />
    </svg>
  );
}

export { Landing };
