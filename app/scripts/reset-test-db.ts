import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@wasabi/prisma/client";

/**
 * Truncates the E2E database between runs.
 *
 * Guarded so it can only ever touch a database whose name ends in `_test` —
 * running it against a development or production URL aborts instead.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const dbName = new URL(connectionString).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset "${dbName}": this script only runs against a database named *_test.`,
    );
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  const email = (process.env.SEED_USER_EMAIL ?? "founder@wasabi.local").toLowerCase();
  await db.user.create({
    data: {
      email,
      name: process.env.SEED_USER_NAME ?? "Founder",
      passwordHash: await bcrypt.hash(process.env.SEED_USER_PASSWORD ?? "wasabi-dev-password", 10),
    },
  });

  console.log(`Reset ${dbName} (${tables.length} tables) and seeded ${email}`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
