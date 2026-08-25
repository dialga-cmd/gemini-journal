import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin's internals (jwks-rsa) do CJS requires that break when a
  // bundler rewrites the module graph. Load it natively from node_modules.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
