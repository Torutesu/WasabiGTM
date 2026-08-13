import { db } from "@/lib/db";
import { NotFoundError, projectBySlug, withUser } from "@/lib/api";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/cards/[id]">,
) {
  const { slug, id } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const card = await db.feedCard.findFirst({
      where: { id, projectId: project.id },
      include: {
        drafts: { orderBy: { version: "desc" }, include: { qualityReview: true } },
        publishRecord: { include: { outcomes: { orderBy: { capturedAt: "desc" }, take: 1 } } },
      },
    });
    if (!card) throw new NotFoundError("Card not found");
    return { card };
  });
}
