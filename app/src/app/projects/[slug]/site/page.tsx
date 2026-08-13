import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SiteView } from "./site-view";
import type { Issue } from "@/lib/audit";

/** SCR-005 — SEO and GEO health. */
export default async function SitePage({ params }: PageProps<"/projects/[slug]/site">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const [seo, geo, history] = await Promise.all([
    db.siteAudit.findFirst({
      where: { projectId: project.id, kind: "SEO" },
      orderBy: { createdAt: "desc" },
    }),
    db.siteAudit.findFirst({
      where: { projectId: project.id, kind: "GEO" },
      orderBy: { createdAt: "desc" },
    }),
    db.siteAudit.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { kind: true, score: true },
    }),
  ]);

  const previous = (kind: string) => {
    const scores = history.filter((h) => h.kind === kind).map((h) => h.score);
    return scores.length > 1 ? scores[1] : null;
  };

  return (
    <SiteView
      slug={slug}
      seo={
        seo
          ? {
              score: seo.score,
              stale: seo.stale,
              previous: previous("SEO"),
              issues: seo.issues as unknown as Issue[],
            }
          : null
      }
      geo={
        geo
          ? {
              score: geo.score,
              stale: geo.stale,
              previous: previous("GEO"),
              issues: geo.issues as unknown as Issue[],
            }
          : null
      }
    />
  );
}
