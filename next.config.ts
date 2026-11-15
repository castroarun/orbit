import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Template pictures are uploaded through a form (Vercel caps requests at 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
