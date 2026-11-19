import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@acs/schemas",
    "@acs/domain",
    "@acs/agent-contracts",
    "@acs/integrations",
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
