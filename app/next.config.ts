import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // The container runs .next/standalone, so the server and everything it
  // traces must be emitted. Only for that build: `next start` refuses to serve
  // a standalone output, and that is what local runs and the E2E suite use.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Lockfiles exist both here and one level up; without pinning the root Next
  // traces from the wrong directory and the standalone bundle loses files.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Left for the host bundler to resolve rather than inlined by Next. Prisma's
  // client ships one build per runtime behind package export conditions, and
  // only the host bundler knows which runtime it is targeting — inlining here
  // would always pick the Node build, whose WASM query compiler cannot load on
  // Workers.
  serverExternalPackages: ["@wasabi/prisma", "@prisma/adapter-pg", "pg"],
  outputFileTracingIncludes: {
    // `pg` reaches for pg-cloudflare behind a guarded require, so tracing never
    // sees it. The Workers build needs it: it is the TCP socket implementation
    // Postgres uses on workerd.
    "/**": ["./node_modules/pg-cloudflare/**"],
  },
};

export default nextConfig;
