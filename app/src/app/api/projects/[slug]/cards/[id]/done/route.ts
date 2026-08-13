import { db } from "@/lib/db";
import { NotFoundError, projectBySlug, withUser } from "@/lib/api";
import { CardStatus, PublishMethod } from "@/generated/prisma/client";

/**
 * Marks a manually-published card done. The external URL is optional but is what
 * lets the outcome loop measure it, so the UI always asks for it.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/cards/[id]/done">,
) {
  const { slug, id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { externalUrl?: string };

  return withUser(async ({ user }) => {
    const project = await projectBySlug(slug);
    const card = await db.feedCard.findFirst({ where: { id, projectId: project.id } });
    if (!card) throw new NotFoundError("Card not found");

    const utm = `utm_source=wasabi&utm_medium=${card.channel.toLowerCase()}&utm_campaign=${card.id}`;

    const record = await db.publishRecord.upsert({
      where: { cardId: card.id },
      update: { externalUrl: body.externalUrl ?? null },
      create: {
        projectId: project.id,
        cardId: card.id,
        channel: card.channel,
        method: PublishMethod.MANUAL,
        externalUrl: body.externalUrl ?? null,
        utm,
      },
    });

    await db.feedCard.update({
      where: { id: card.id },
      data: { status: CardStatus.DONE, approvedById: user.id },
    });

    return { record };
  });
}
