import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { appConfigured, appSlug } from "@/lib/github-app";
import { IntegrationsView } from "./integrations-view";

/** SCR-014 */
export default async function IntegrationsPage({
  params,
  searchParams,
}: PageProps<"/projects/[slug]/integrations">) {
  const { slug } = await params;
  const query = await searchParams;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const rows = await db.integration.findMany({ where: { projectId: project.id } });

  // Whether a provider can be connected at all is a server-side fact; the client
  // only learns the yes/no, never the credentials.
  const providers = {
    x: Boolean(process.env.X_CLIENT_ID),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    githubApp: appConfigured() && Boolean(appSlug()),
    mock: process.env.WASABI_MOCK_EXTERNAL === "1",
  };

  return (
    <IntegrationsView
      slug={slug}
      integrations={rows.map((row) => ({
        kind: row.kind,
        status: row.status,
        label: row.label,
      }))}
      providers={providers}
      notice={{
        connected: first(query.connected),
        error: first(query.error),
      }}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
