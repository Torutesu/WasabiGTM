import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { IntegrationsView } from "./integrations-view";

/** SCR-014 */
export default async function IntegrationsPage({
  params,
}: PageProps<"/projects/[slug]/integrations">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const rows = await db.integration.findMany({ where: { projectId: project.id } });

  return (
    <IntegrationsView
      slug={slug}
      integrations={rows.map((row) => ({
        kind: row.kind,
        status: row.status,
        label: row.label,
      }))}
    />
  );
}
