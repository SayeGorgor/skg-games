
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  org: "saye-gorgor",
  project: "skg-games",

  // Upload source maps when authenticated.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only show Sentry build logs in CI.
  silent: !process.env.CI,

  // Keep default source-map upload scope initially.
  widenClientFileUpload: false,

  // Reduce SDK debug code in production bundles.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
