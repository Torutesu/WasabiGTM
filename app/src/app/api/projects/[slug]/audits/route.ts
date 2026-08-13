import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";
import { AuditKind } from "@wasabi/prisma/client";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/audits">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const [seo, geo, history] = await Promise.all([
      db.siteAudit.findFirst({
        where: { projectId: project.id, kind: AuditKind.SEO },
        orderBy: { createdAt: "desc" },
      }),
      db.siteAudit.findFirst({
        where: { projectId: project.id, kind: AuditKind.GEO },
        orderBy: { createdAt: "desc" },
      }),
      db.siteAudit.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { kind: true, score: true, createdAt: true },
      }),
    ]);
    return { seo, geo, history };
  });
}
