/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // wagmi / viem / RainbowKit ship ESM-only subpaths that Next must transpile.
  transpilePackages: ["viem", "wagmi", "@rainbow-me/rainbowkit"],

  webpack: (config) => {
    /**
     * Two optional peers of the wallet SDKs are node/react-native only. They
     * are lazy-loaded behind try/catch at runtime, so stubbing them out keeps
     * `next build` warning-free without changing behaviour in the browser.
     *
     *   pino-pretty                            <- @walletconnect/logger (pino)
     *   @react-native-async-storage/...        <- @metamask/sdk
     */
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      "lokijs": false,
      "react-native": false,
    };
    return config;
  },
};

export default nextConfig;
