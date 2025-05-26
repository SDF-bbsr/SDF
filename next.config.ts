import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: {
    allowedDevOrigins: [],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
