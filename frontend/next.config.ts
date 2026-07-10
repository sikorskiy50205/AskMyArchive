import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // A stray package-lock.json in the user profile makes Next mis-detect the
  // workspace root; pin it to this package.
  turbopack: { root: __dirname },
};

export default withNextIntl(nextConfig);
