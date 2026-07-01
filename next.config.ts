import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image stays lean.
  output: "standalone",
};

export default nextConfig;
