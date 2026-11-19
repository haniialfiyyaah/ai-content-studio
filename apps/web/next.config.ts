import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@acs/schemas",
    "@acs/domain",
    "@acs/agent-contracts",
    "@acs/integrations",
    "remotion",
    "@remotion/player",
    "@remotion/web-renderer",
    "mediabunny",
  ],
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
