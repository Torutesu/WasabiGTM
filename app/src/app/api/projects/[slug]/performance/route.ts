import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";

/** Rolls published items up into the funnel and per-channel table (SCR-009). */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/performance">) {
  const { slug } = await ctx.params;
  const period = new URL(request.url).searchParams.get("period") ?? "28d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 28;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const records = await db.publishRecord.findMany({
      where: { projectId: project.id, publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
      include: {
        outcomes: { orderBy: { capturedAt: "desc" }, take: 1 },
        card: { select: { id: true, title: true, channel: true } },
      },
    });

    const funnel = { published: records.length, impressions: 0, clicks: 0, signups: 0 };
    const byChannel = new Map<
      string,
      { channel: string; published: number; impressions: number; clicks: number; signups: number }
    >();

    const rows = records.map((record) => {
      const metrics = (record.outcomes[0]?.metrics ?? {}) as Record<string, number>;
      const impressions = Number(metrics.impressions ?? 0);
      const clicks = Number(metrics.clicks ?? 0);
      const signups = Number(metrics.signups ?? 0);

      funnel.impressions += impressions;
      funnel.clicks += clicks;
      funnel.signups += signups;

      const entry = byChannel.get(record.channel) ?? {
        channel: record.channel,
        published: 0,
        impressions: 0,
        clicks: 0,
        signups: 0,
      };
      entry.published += 1;
      entry.impressions += impressions;
      entry.clicks += clicks;
      entry.signups += signups;
      byChannel.set(record.channel, entry);

      return {
        id: record.id,
        cardId: record.cardId,
        title: record.card.title,
        channel: record.channel,
        method: record.method,
        externalUrl: record.externalUrl,
        utm: record.utm,
        publishedAt: record.publishedAt,
        impressions,
        clicks,
        signups,
      };
    });

    const reviews = await db.weeklyReview.findMany({
      where: { projectId: project.id },
      orderBy: { weekStart: "desc" },
      take: 10,
    });

    return { funnel, byChannel: Array.from(byChannel.values()), records: rows, reviews };
  });
}
