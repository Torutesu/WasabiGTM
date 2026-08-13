import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PerformanceView } from "./performance-view";

/** SCR-009 — the closed loop: what shipped, what it did, what we learned. */
export default async function PerformancePage({
  params,
}: PageProps<"/projects/[slug]/performance">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  return <PerformanceView slug={slug} />;
}
