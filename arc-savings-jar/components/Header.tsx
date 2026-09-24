"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

import Logo from "@/components/Logo";
import { TARGET_NETWORK } from "@/config/contracts";

/**
 * Sticky app header: brand on the left, RainbowKit's ConnectButton on the
 * right. Rendered in every one of the four UI states.
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-500/70 bg-navy-800/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Logo size={34} />

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-navy-500 bg-navy-700/70 px-3 py-1 text-[11px] font-medium text-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {TARGET_NETWORK === "testnet" ? "Arc Testnet · 5042002" : "Arc Mainnet · 5042"}
          </span>

          {/* RainbowKit renders Connect / wrong-network / account menu for us. */}
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && Boolean(account) && Boolean(chain);

              return (
                <div
                  {...(!ready ? { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } } : {})}
                >
                  {connected ? (
                    <div className="flex items-center gap-2">
                      {chain?.unsupported ? (
                        <button type="button" onClick={openChainModal} className="btn-gold !px-3 !py-2 !text-xs">
                          Wrong network
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openChainModal}
                          className="hidden items-center gap-1.5 rounded-xl border border-navy-500 bg-navy-700/70 px-3 py-2 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-white sm:flex"
                        >
                          {chain?.hasIcon && chain?.iconUrl ? (
                            <span
                              className="h-3.5 w-3.5 rounded-full bg-accent/30"
                              style={{ background: `url(${chain.iconUrl}) center/cover` }}
                              aria-hidden="true"
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                          )}
                          {chain?.name ?? "Arc Mainnet"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={openAccountModal}
                        className="inline-flex items-center gap-2 rounded-xl border border-navy-500 bg-navy-700/70 px-3 py-2 text-xs font-semibold text-white transition hover:border-accent/50 hover:text-accent"
                      >
                        <span className="h-4 w-4 rounded-full bg-gradient-to-br from-accent to-accent-dim" aria-hidden="true" />
                        {account?.displayName ?? "Account"}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={openConnectModal} className="btn-primary !px-4 !py-2 !text-xs">
                      Connect Wallet
                    </button>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
}

export { Header };
