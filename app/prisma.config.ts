import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `env()` throws when the variable is missing, which breaks the commands
    // that never touch the database — `prisma generate` runs on postinstall,
    // long before anyone has a connection string. Commands that do need it
    // fail on their own with a clearer message than a config load error.
    url: process.env.DATABASE_URL ? env("DATABASE_URL") : "",
  },
});
