import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";
import { CardStatus } from "@/generated/prisma/client";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const [pending, publishedToday, seo, geo] = await Promise.all([
      db.feedCard.count({ where: { projectId: project.id, status: CardStatus.CURRENT } }),
      db.publishRecord.count({
        where: {
          projectId: project.id,
          publishedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.siteAudit.findFirst({
        where: { projectId: project.id, kind: "SEO" },
        orderBy: { createdAt: "desc" },
      }),
      db.siteAudit.findFirst({
        where: { projectId: project.id, kind: "GEO" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      project,
      summary: {
        pending,
        publishedToday,
        seoScore: seo?.score ?? null,
        geoScore: geo?.score ?? null,
      },
    };
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[slug]">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const updated = await db.project.update({
      where: { id: project.id },
      data: {
        name: typeof body.name === "string" ? body.name : undefined,
        url: typeof body.url === "string" ? body.url : undefined,
        phase: typeof body.phase === "string" ? body.phase : undefined,
        languages: Array.isArray(body.languages) ? (body.languages as string[]) : undefined,
        cycleHours: typeof body.cycleHours === "number" ? body.cycleHours : undefined,
        status: typeof body.status === "string" ? (body.status as never) : undefined,
      },
    });
    return { project: updated };
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[slug]">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    await db.project.delete({ where: { id: project.id } });
    return { ok: true };
  });
}
