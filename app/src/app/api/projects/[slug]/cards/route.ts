import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { createFixCard } from "@/lib/jobs";
import type { Issue } from "@/lib/audit";
import {
  CardStatus,
  Channel,
  Difficulty,
  DraftAuthor,
  Priority,
} from "@wasabi/prisma/client";

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/cards">) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? CardStatus.CURRENT;
  const channel = url.searchParams.get("channel");
  const language = url.searchParams.get("language");

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const cards = await db.feedCard.findMany({
      where: {
        projectId: project.id,
        status: status as CardStatus,
        channel: channel ? (channel as Channel) : undefined,
        language: language ?? undefined,
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        drafts: { orderBy: { version: "desc" }, include: { qualityReview: true } },
        publishRecord: true,
      },
    });
    return { cards };
  });
}

type CreateBody = {
  channel?: string;
  type?: string;
  title?: string;
  content?: string;
  rationale?: string;
  language?: string;
  issue?: Issue;
};

/** Used by the Site screen's "Create fix" and by chat's "Add to feed". */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/cards">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as CreateBody;

  return withUser(async () => {
    const project = await projectBySlug(slug);

    if (body.issue) {
      const cardId = await createFixCard({
        projectId: project.id,
        issue: body.issue,
        type: body.type ?? "seo_fix",
      });
      const card = await db.feedCard.findUniqueOrThrow({ where: { id: cardId } });
      return { card };
    }

    if (!body.channel || !body.content) {
      throw new BadRequestError("channel and content are required");
    }

    const card = await db.feedCard.create({
      data: {
        projectId: project.id,
        channel: body.channel as Channel,
        type: body.type ?? "tweet",
        title: body.title ?? body.content.slice(0, 80),
        language: body.language ?? "en",
        rationale: body.rationale ?? "Created from the CMO chat.",
        priority: Priority.MEDIUM,
        difficulty: Difficulty.EASY,
      },
    });

    await db.draft.create({
      data: {
        cardId: card.id,
        version: 1,
        content: body.content,
        authorType: DraftAuthor.AGENT,
      },
    });

    return { card };
  });
}
