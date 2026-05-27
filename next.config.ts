import type { NextConfig } from "next";

const config: NextConfig = {
  // Sheet/PDF rendering uses Playwright in API routes — it requires Node runtime,
  // not the Edge runtime. Routes that use it must export `runtime = "nodejs"`.
  reactStrictMode: true,
  // pdf-lib + playwright are pure node packages; keep them external from server bundles.
  // (Moved out of `experimental` in Next 15.)
  serverExternalPackages: ["pdf-lib", "playwright"],
};

export default config;
