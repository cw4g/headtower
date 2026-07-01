import type { NextConfig } from "next";

// Optional sub-path mount (e.g. "/admin"), baked in at build time via env.
// Leave unset to serve at the root.
const basePath = process.env.HEADTOWER_BASE_PATH?.trim() || undefined;

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image stays lean.
  output: "standalone",
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
