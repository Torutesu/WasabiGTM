import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const jobs = await db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 3 });
  for (const j of jobs) {
    console.log(`--- ${j.kind} ${j.status} attempt=${j.attempt}`);
    console.log("error:", j.error);
    console.log("log:", j.log);
  }
  const sources = await db.contextSource.findMany();
  for (const s of sources) console.log("source:", s.kind, JSON.stringify(s.config), "err:", s.lastError);
  await db.$disconnect();
}
main();
