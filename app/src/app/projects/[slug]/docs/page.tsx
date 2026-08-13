import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DocsView } from "./docs-view";

/** SCR-004 — Foundation docs + Living Context sources. */
export default async function DocsPage({ params }: PageProps<"/projects/[slug]/docs">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const [docs, sources] = await Promise.all([
    db.foundationDoc.findMany({ where: { projectId: project.id } }),
    db.contextSource.findMany({ where: { projectId: project.id }, orderBy: { kind: "asc" } }),
  ]);

  return (
    <DocsView
      slug={slug}
      docs={docs.map((doc) => ({
        kind: doc.kind,
        content: doc.content,
        version: doc.version,
        updatedBy: doc.updatedBy,
        updatedAt: doc.updatedAt.toISOString(),
      }))}
      sources={sources.map((source) => ({
        id: source.id,
        kind: source.kind,
        config: (source.config ?? {}) as Record<string, unknown>,
        lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
        lastError: source.lastError,
        suggestion: (source.suggestion ?? null) as Record<string, unknown> | null,
      }))}
    />
  );
}
