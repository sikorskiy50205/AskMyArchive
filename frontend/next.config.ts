import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // A stray package-lock.json in the user profile makes Next mis-detect the
  // workspace root; pin it to this package.
  turbopack: { root: __dirname },
  // Hide the dev-only status badge. It's rendered in a shadow root outside the
  // app tree and can visually poke below the layout at short viewport heights.
  devIndicators: false,
};

export default withNextIntl(nextConfig);
