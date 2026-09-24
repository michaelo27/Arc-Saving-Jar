"use client";

import { formatUsd } from "@/lib/format";

export interface JarVisualProps {
  /** 0-100. How much of the lock period has elapsed. */
  fillPercentage: number;
  /** Deposited amount in raw USDC units (6 decimals). */
  amount: bigint;
  /** Label stored on-chain. */
  jarName: string;
  /** Unlocked jars get a pulsing gold outline + glow. */
  isUnlocked?: boolean;
  /** Render at a smaller scale (sidebars, modals). */
  compact?: boolean;
  className?: string;
}

/* Mason-jar geometry in a 200 x 260 viewBox. */
const VIEW_W = 200;
const VIEW_H = 260;
const LIQUID_TOP = 62;
const LIQUID_BOTTOM = 232;
const LIQUID_HEIGHT = LIQUID_BOTTOM - LIQUID_TOP;

/**
 * The savings jar itself: an inline SVG mason jar whose liquid level is the
 * elapsed share of the lock period, with two counter-scrolling wave layers so
 * the surface reads as liquid rather than a flat bar.
 */
export default function JarVisual({
  fillPercentage,
  amount,
  jarName,
  isUnlocked = false,
  compact = false,
  className = "",
}: JarVisualProps) {
  const fill = Math.min(100, Math.max(0, Number.isFinite(fillPercentage) ? fillPercentage : 0));
  const liquidHeight = (fill / 100) * LIQUID_HEIGHT;
  const surfaceY = LIQUID_BOTTOM - liquidHeight;
  const waveShift = 8;

  const widthClass = compact ? "w-[190px]" : "w-[260px] sm:w-[300px]";

  return (
    <div className={`relative flex flex-col items-center ${widthClass} ${className}`}>
      {/* Gold aura for a matured jar */}
      {isUnlocked ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 rounded-full bg-gold/20 blur-3xl animate-gold-pulse"
        />
      ) : null}

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`relative w-full ${isUnlocked ? "animate-gold-pulse rounded-[2rem]" : ""}`}
        role="img"
        aria-label={`Savings jar ${jarName ? `named ${jarName}` : ""}, ${fill.toFixed(
          0,
        )}% of the lock period elapsed, holding ${formatUsd(amount)}`}
      >
        <defs>
          {/* Inner glass volume - the liquid is clipped to this. */}
          <clipPath id="jar-clip">
            <path d={jarBodyPath()} />
          </clipPath>

          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="18%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="82%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.09" />
          </linearGradient>

          <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#0091C2" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0B4C7A" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="liquid-unlocked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE08A" stopOpacity="0.98" />
            <stop offset="50%" stopColor="#FFB800" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#B37F00" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3A4A73" />
            <stop offset="100%" stopColor="#1B2440" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------------- liquid */}
        <g clipPath="url(#jar-clip)">
          {/* Empty-jar tint so the glass always reads as a container */}
          <rect x="0" y={LIQUID_TOP} width={VIEW_W} height={LIQUID_HEIGHT} fill="#0E1730" />

          {liquidHeight > 0 ? (
            <>
              <rect
                x="0"
                y={surfaceY}
                width={VIEW_W}
                height={liquidHeight + 2}
                fill={isUnlocked ? "url(#liquid-unlocked)" : "url(#liquid)"}
              />

              {/* Back wave (slower, dimmer) */}
              <g className="animate-jar-wave-slow" opacity={isUnlocked ? 0.35 : 0.28}>
                <path
                  d={wavePath(surfaceY - waveShift, waveShift * 1.4)}
                  fill={isUnlocked ? "#FFE08A" : "#7DE8FF"}
                />
              </g>

              {/* Front wave (spec's simple animated surface) */}
              <g className="animate-jar-wave" opacity={0.55}>
                <path
                  d={wavePath(surfaceY, waveShift)}
                  fill={isUnlocked ? "#FFCF4D" : "#00D4FF"}
                />
              </g>

              {/* Rising bubbles while the jar is still filling up */}
              {!isUnlocked && fill < 99.5 ? (
                <>
                  <circle cx="72" cy={surfaceY + 40} r="3" fill="#BFF3FF" opacity="0.5" className="animate-bubble" />
                  <circle cx="120" cy={surfaceY + 70} r="2" fill="#BFF3FF" opacity="0.45" className="animate-bubble-2" />
                  <circle cx="98" cy={surfaceY + 110} r="2.5" fill="#BFF3FF" opacity="0.35" className="animate-bubble-3" />
                </>
              ) : null}
            </>
          ) : null}

          {/* Glass sheen + measurement marks, drawn over the liquid */}
          <rect x="0" y={LIQUID_TOP} width={VIEW_W} height={LIQUID_HEIGHT} fill="url(#glass)" />
          <g stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1.5" strokeLinecap="round">
            <line x1="164" y1="104" x2="182" y2="104" />
            <line x1="170" y1="146" x2="182" y2="146" />
            <line x1="164" y1="188" x2="182" y2="188" />
          </g>
          <rect x="42" y="76" width="9" height="128" rx="4.5" fill="#FFFFFF" fillOpacity="0.10" />
        </g>

        {/* ------------------------------------------------------------ jar */}
        <path
          d={jarOutlinePath()}
          fill="none"
          stroke={isUnlocked ? "#FFB800" : "rgba(160,174,192,0.55)"}
          strokeWidth={isUnlocked ? 3 : 2.5}
          strokeLinejoin="round"
        />

        {/* Screw-top lid */}
        <rect x="52" y="12" width="96" height="22" rx="7" fill="url(#lid)" stroke="rgba(160,174,192,0.45)" strokeWidth="1.5" />
        <rect x="56" y="30" width="88" height="14" rx="5" fill="#141D38" stroke="rgba(160,174,192,0.35)" strokeWidth="1.5" />
        <g stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="66" y1="17" x2="66" y2="29" />
          <line x1="82" y1="17" x2="82" y2="29" />
          <line x1="98" y1="17" x2="98" y2="29" />
          <line x1="114" y1="17" x2="114" y2="29" />
          <line x1="130" y1="17" x2="130" y2="29" />
        </g>

        {/* Paper label */}
        <g>
          <rect
            x="44"
            y="112"
            width="112"
            height="62"
            rx="10"
            fill="#0A0F1E"
            fillOpacity="0.82"
            stroke={isUnlocked ? "rgba(255,184,0,0.6)" : "rgba(0,212,255,0.35)"}
            strokeWidth="1.5"
          />
          <text
            x="100"
            y="139"
            textAnchor="middle"
            className="fill-white"
            style={{ font: `600 ${compact ? 19 : 21}px var(--font-inter), Inter, sans-serif` }}
          >
            {formatUsd(amount)}
          </text>
          <text
            x="100"
            y="160"
            textAnchor="middle"
            className="fill-muted"
            style={{ font: `500 11px var(--font-inter), Inter, sans-serif` }}
          >
            {truncate(jarName, 20) || "Savings Jar"}
          </text>
        </g>
      </svg>

      {isUnlocked ? (
        <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
          <LockIcon open /> Unlocked
        </span>
      ) : (
        <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-navy-500 bg-navy-700/70 px-3 py-1 text-xs font-medium text-muted">
          <LockIcon /> Locked - {fill.toFixed(0)}% elapsed
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Inner volume used to clip the liquid. */
function jarBodyPath(): string {
  return [
    "M58 44",
    "L142 44",
    "L142 62",
    "C168 70 176 86 176 104",
    "L176 214",
    "C176 230 166 240 150 240",
    "L50 240",
    "C34 240 24 230 24 214",
    "L24 104",
    "C24 86 32 70 58 62",
    "Z",
  ].join(" ");
}

/** Outer silhouette (shoulders + body), stroked on top of everything. */
function jarOutlinePath(): string {
  return [
    "M56 44",
    "L56 62",
    "C30 70 22 86 22 104",
    "L22 214",
    "C22 232 33 242 50 242",
    "L150 242",
    "C167 242 178 232 178 214",
    "L178 104",
    "C178 86 170 70 144 62",
    "L144 44",
  ].join(" ");
}

/**
 * A sinusoidal crest repeated across a 600-unit-wide band that starts 200 units
 * to the left of the jar. The wavelength is exactly 200 units, so translating
 * the layer by -50% (300 units) loops it seamlessly.
 */
function wavePath(surfaceY: number, amplitude: number): string {
  // 2 wavelengths wide, starting one wavelength left of the jar: translating the
  // layer by -50% moves it exactly one wavelength, which loops seamlessly.
  const wavelength = VIEW_W * 1.5; // 300
  const wavelengths = 2;
  const startX = -wavelength;
  const endX = startX + wavelength * wavelengths;
  const y = Math.max(LIQUID_TOP, surfaceY);
  const half = wavelength / 2;
  const q = wavelength / 4;

  const segments: string[] = [`M${startX} ${y}`];
  for (let i = 0; i < wavelengths * 2; i += 1) {
    // Alternate crest / trough for a clean sine silhouette.
    const dir = i % 2 === 0 ? -1 : 1;
    segments.push(`c ${q} ${dir * amplitude} ${q * 3} ${dir * amplitude} ${half} 0`);
  }
  segments.push(`L${endX} ${LIQUID_BOTTOM + 24} L${startX} ${LIQUID_BOTTOM + 24} Z`);
  return segments.join(" ");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      {open ? <path d="M8 10V7a4 4 0 0 1 7.5-2" /> : <path d="M8 10V7a4 4 0 0 1 8 0v3" />}
    </svg>
  );
}

export { JarVisual };
