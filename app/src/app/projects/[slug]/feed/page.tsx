import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FeedView } from "./feed-view";
import { IntegrationKind } from "@wasabi/prisma/client";

/** SCR-010 — the daily opportunity queue. */
export default async function FeedPage({ params }: PageProps<"/projects/[slug]/feed">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const integrations = await db.integration.findMany({ where: { projectId: project.id } });
  const status: Record<string, string> = {};
  for (const integration of integrations) status[integration.kind] = integration.status;

  /**
   * An integration in ERROR still offers its publish action. Hiding the button
   * would look identical to never having connected it, leaving the user with no
   * way to find out the token expired — pressing it surfaces that directly.
   */
  const usable = (kind: IntegrationKind) =>
    status[kind] === "CONNECTED" || status[kind] === "ERROR";

  return (
    <FeedView
      slug={slug}
      languages={project.languages}
      xConnected={usable(IntegrationKind.X_OAUTH)}
      githubConnected={usable(IntegrationKind.GITHUB_APP)}
      cmsConnected={usable(IntegrationKind.CMS_WEBHOOK)}
    />
  );
}
