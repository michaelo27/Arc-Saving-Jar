"use client";

export interface LogoProps {
  /** Icon height in pixels. */
  size?: number;
  /** Render the "Arc Savings Jar" wordmark next to the icon. */
  withWordmark?: boolean;
  /** Muted wordmark variant for footers. */
  muted?: boolean;
  className?: string;
}

/**
 * The Arc Savings Jar mark: an inline SVG mason jar with a cyan fill line and a
 * coin dropping in. No external image assets anywhere in this app.
 */
export default function Logo({
  size = 36,
  withWordmark = true,
  muted = false,
  className = "",
}: LogoProps) {
  const id = `logo-${size}-${withWordmark ? "w" : "i"}`;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="shrink-0">
        <defs>
          <linearGradient
            id={`${id}-liquid`}
            x1="24"
            y1="20"
            x2="24"
            y2="42"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D4FF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#0B4C7A" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient
            id={`${id}-glow`}
            x1="24"
            y1="0"
            x2="24"
            y2="48"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D4FF" stopOpacity="0.5" />
            <stop offset="1" stopColor="#00D4FF" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <path d="M14 13h20v3.6c3.9 1.3 6 4 6 7.4v13.2c0 3.6-2.4 5.8-6 5.8H14c-3.6 0-6-2.2-6-5.8V24c0-3.4 2.1-6.1 6-7.4V13Z" />
          </clipPath>
        </defs>

        {/* soft halo */}
        <circle
          cx="24"
          cy="26"
          r="20"
          fill={`url(#${id}-glow)`}
          opacity="0.35"
        />

        {/* liquid */}
        <g clipPath={`url(#${id}-clip)`}>
          <rect
            x="6"
            y="26"
            width="36"
            height="20"
            fill={`url(#${id}-liquid)`}
          />
          <path
            d="M6 26q4.5-2.4 9 0t9 0 9 0 9 0v3H6v-3Z"
            fill="#7DE8FF"
            opacity="0.55"
          />
          {/* coin sinking in */}
          <circle cx="24" cy="31" r="3.4" fill="#FFB800" opacity="0.95" />
          <path
            d="M24 29.2v3.6M22.6 30.2h2.8M22.6 31.9h2.8"
            stroke="#0A0F1E"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        </g>

        {/* glass */}
        <path
          d="M14 13h20v3.6c3.9 1.3 6 4 6 7.4v13.2c0 3.6-2.4 5.8-6 5.8H14c-3.6 0-6-2.2-6-5.8V24c0-3.4 2.1-6.1 6-7.4V13Z"
          stroke="#A0AEC0"
          strokeOpacity="0.75"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* lid */}
        <rect
          x="13"
          y="6"
          width="22"
          height="6"
          rx="2.4"
          fill="#1E2A4A"
          stroke="#A0AEC0"
          strokeOpacity="0.7"
          strokeWidth="1.8"
        />
        {/* sheen */}
        <path
          d="M13.5 19v18"
          stroke="#FFFFFF"
          strokeOpacity="0.25"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>

      {withWordmark ? (
        <span className="flex flex-col leading-none">
          <span
            className={`text-[15px] font-semibold tracking-tight ${muted ? "text-muted" : "text-white"}`}>
            Arc Savings Jar
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-accent/80">
            Powered by Arc
          </span>
        </span>
      ) : null}
    </span>
  );
}

export { Logo };
