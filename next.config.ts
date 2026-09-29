import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these from node_modules instead of bundling them, so the sync server,
  // route handlers and SSR share one Yjs in the server process (#10).
  serverExternalPackages: ["@hocuspocus/server", "yjs"],
};

export default nextConfig;
