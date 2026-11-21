import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@acs/domain", "@acs/integrations", "@acs/mascot"],
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
