import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FeedView } from "./feed-view";
import { IntegrationKind } from "@/generated/prisma/client";

/** SCR-010 — the daily opportunity queue. */
export default async function FeedPage({ params }: PageProps<"/projects/[slug]/feed">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const integrations = await db.integration.findMany({ where: { projectId: project.id } });
  const connected: Record<string, string> = {};
  for (const integration of integrations) connected[integration.kind] = integration.status;

  return (
    <FeedView
      slug={slug}
      languages={project.languages}
      xConnected={connected[IntegrationKind.X_OAUTH] === "CONNECTED"}
      githubConnected={connected[IntegrationKind.GITHUB_APP] === "CONNECTED"}
      cmsConnected={connected[IntegrationKind.CMS_WEBHOOK] === "CONNECTED"}
    />
  );
}
