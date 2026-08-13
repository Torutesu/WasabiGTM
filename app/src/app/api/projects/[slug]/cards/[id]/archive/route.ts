import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, projectBySlug, withUser } from "@/lib/api";
import { CardStatus } from "@wasabi/prisma/client";

const REASONS = ["inaccurate", "off_voice", "not_needed"];

/** The archive reason is training signal, so it is required rather than optional. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/cards/[id]/archive">,
) {
  const { slug, id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  return withUser(async () => {
    if (!body.reason || !REASONS.includes(body.reason)) {
      throw new BadRequestError(`reason must be one of: ${REASONS.join(", ")}`);
    }
    const project = await projectBySlug(slug);
    const card = await db.feedCard.findFirst({ where: { id, projectId: project.id } });
    if (!card) throw new NotFoundError("Card not found");

    const updated = await db.feedCard.update({
      where: { id: card.id },
      data: { status: CardStatus.ARCHIVED, archiveReason: body.reason },
    });
    return { card: updated };
  });
}
