import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, projectBySlug, withUser } from "@/lib/api";
import { DraftAuthor } from "@wasabi/prisma/client";

/**
 * A human edit always creates a new draft version rather than mutating the
 * agent's. Those HUMAN versions are the training signal for AIF-010.
 */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/cards/[id]/draft">,
) {
  const { slug, id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { content?: string };

  return withUser(async () => {
    if (typeof body.content !== "string" || !body.content.trim()) {
      throw new BadRequestError("content is required");
    }
    const project = await projectBySlug(slug);
    const card = await db.feedCard.findFirst({
      where: { id, projectId: project.id },
      include: { drafts: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!card) throw new NotFoundError("Card not found");

    const latest = card.drafts[0];
    const draft = await db.draft.create({
      data: {
        cardId: card.id,
        version: (latest?.version ?? 0) + 1,
        content: body.content,
        meta: (latest?.meta ?? {}) as never,
        authorType: DraftAuthor.HUMAN,
      },
    });

    return { draft };
  });
}
