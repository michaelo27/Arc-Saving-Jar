import type { Config } from "tailwindcss";

/**
 * Arc Savings Jar design tokens
 * - background:  #0A0F1E (deep navy)
 * - accent:      #00D4FF (electric cyan)   -> primary actions
 * - warning:     #FFB800 (warm gold)       -> warnings / Break Jar
 * - text:        #FFFFFF primary, #A0AEC0 secondary
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0A0F1E",
          900: "#060A15",
          800: "#0A0F1E",
          700: "#111831",
          600: "#16203C",
          500: "#1E2A4A",
        },
        accent: {
          DEFAULT: "#00D4FF",
          dim: "#0099BB",
          glow: "rgba(0, 212, 255, 0.35)",
        },
        gold: {
          DEFAULT: "#FFB800",
          dim: "#B37F00",
          glow: "rgba(255, 184, 0, 0.35)",
        },
        muted: "#A0AEC0",
        danger: {
          DEFAULT: "#FF4D4D",
          dim: "#7F1D1D",
        },
        success: {
          DEFAULT: "#22C55E",
          dim: "#14532D",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 10px 40px -12px rgba(0, 0, 0, 0.65)",
        "card-hover": "0 18px 55px -14px rgba(0, 0, 0, 0.8)",
        accent: "0 0 0 1px rgba(0, 212, 255, 0.35), 0 12px 45px -12px rgba(0, 212, 255, 0.45)",
        gold: "0 0 0 1px rgba(255, 184, 0, 0.45), 0 12px 45px -12px rgba(255, 184, 0, 0.5)",
      },
      keyframes: {
        // Liquid surface: the wave band is 2 wavelengths wide, so -50% of its
        // own box == exactly one wavelength == a seamless loop.
        "jar-wave": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "jar-wave-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        bubble: {
          "0%": { transform: "translateY(0) scale(0.6)", opacity: "0" },
          "15%": { opacity: "0.55" },
          "100%": { transform: "translateY(-70px) scale(1.1)", opacity: "0" },
        },
        "gold-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(255,184,0,0.45), 0 0 28px -6px rgba(255,184,0,0.45)",
          },
          "50%": {
            boxShadow:
              "0 0 0 2px rgba(255,184,0,0.85), 0 0 60px -4px rgba(255,184,0,0.75)",
          },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "jar-wave": "jar-wave 9s linear infinite",
        "jar-wave-slow": "jar-wave-reverse 14s linear infinite",
        bubble: "bubble 6s ease-in infinite",
        "bubble-2": "bubble 8s ease-in 1.6s infinite",
        "bubble-3": "bubble 10s ease-in 3.2s infinite",
        "gold-pulse": "gold-pulse 2.4s ease-in-out infinite",
        "fade-up": "fade-up 0.4s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
