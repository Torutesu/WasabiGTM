import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { describeLlm } from "@/lib/llm";
import { SettingsView } from "./settings-view";

/** SCR-012 */
export default async function SettingsPage({ params }: PageProps<"/projects/[slug]/settings">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const agents = await db.agentConfig.findMany({
    where: { projectId: project.id },
    orderBy: { channel: "asc" },
  });

  // Keys live in the environment, never in the database, so this is read-only.
  const llm = describeLlm();

  return (
    <SettingsView
      slug={slug}
      llm={llm}
      project={{
        name: project.name,
        url: project.url,
        phase: project.phase,
        languages: project.languages,
        cycleHours: project.cycleHours,
        status: project.status,
      }}
      agents={agents.map((agent) => ({
        channel: agent.channel,
        enabled: agent.enabled,
        dailyQuota: agent.dailyQuota,
        instructions: agent.instructions ?? "",
        config: (agent.config ?? {}) as Record<string, unknown>,
      }))}
    />
  );
}
