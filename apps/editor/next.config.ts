import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  experimental: { cpus: 2 },
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingExcludes: { "/*": ["../../reference/**/*"] },
};
export default config;
