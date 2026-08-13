import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@wasabi/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const email = (process.env.SEED_USER_EMAIL ?? "founder@wasabi.local").toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? "wasabi-dev-password";
  const name = process.env.SEED_USER_NAME ?? "Founder";

  await db.user.upsert({
    where: { email },
    update: { name, passwordHash: await bcrypt.hash(password, 10) },
    create: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });

  console.log(`Seeded user ${email}`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
