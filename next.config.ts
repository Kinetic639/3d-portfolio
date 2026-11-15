import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Development-only routes are named page.dev.tsx / route.dev.ts. In a
  // production build those extensions are not page extensions, so the map
  // editor and its file-writing endpoints are not routes at all, and nothing
  // else imports their code: the editor does not exist in production.
  pageExtensions: isProduction ? ["tsx", "ts"] : ["dev.tsx", "dev.ts", "tsx", "ts"],
  // Pages read maps from disk, so file tracing would otherwise copy the
  // editor's source files into the deployment alongside them.
  outputFileTracingExcludes: {
    "/*": ["app/editor/**", "app/api/editor/**", "components/editor/**", "lib/editor/**", "e2e/**", "docs/**"],
  },
};

export default nextConfig;
