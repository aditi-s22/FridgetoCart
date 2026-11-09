import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// One .env at the repo root for every app (auth secrets, Google OAuth keys, API_JWT_SECRET).
loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const config: NextConfig = {
  transpilePackages: ["@ftc/shared"],
};

export default config;
