import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { AnalysisTerminal } from "./analysis-terminal";

/** SCR-002 */
export default async function AnalyzingPage({ params }: PageProps<"/projects/[slug]/analyzing">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const job = await db.jobRun.findFirst({
    where: { projectId: project.id, kind: "ONBOARD_ANALYSIS" },
    orderBy: { startedAt: "desc" },
  });

  return (
    <div className="px-6 py-8">
      <AnalysisTerminal slug={slug} initialJobId={job?.id ?? null} />
    </div>
  );
}
