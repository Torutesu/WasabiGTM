import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, errorResponse, projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  IntegrationError,
  integrationConfig,
  openPullRequest,
  postToX,
  publishToCms,
  slugify,
} from "@/lib/external";
import {
  CardStatus,
  IntegrationKind,
  PublishMethod,
  type Channel,
} from "@wasabi/prisma/client";

/**
 * Publishes a card through the requested channel. Integration failures leave the
 * card in CURRENT so the user can retry after reconnecting — never a silent drop.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/cards/[id]/publish">,
) {
  const { slug, id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { method?: string };

  try {
    const user = await requireUser();
    const project = await projectBySlug(slug);
    const card = await db.feedCard.findFirst({
      where: { id, projectId: project.id },
      include: { drafts: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!card) throw new NotFoundError("Card not found");

    const draft = card.drafts[0];
    if (!draft) throw new BadRequestError("Card has no draft to publish");

    const method = (body.method ?? defaultMethod(card.channel)) as PublishMethod;
    // ERROR integrations are still handed over so the attempt returns
    // "token expired" instead of the indistinguishable "not connected".
    const configFor = (kind: IntegrationKind) =>
      integrationConfig(project.id, kind, { allowError: true });

    // utm_campaign is the card id, so metrics attribute back to the exact card.
    const utm = `utm_source=wasabi&utm_medium=${card.channel.toLowerCase()}&utm_campaign=${card.id}`;
    let externalUrl: string;
    let payload: Record<string, unknown> | undefined;

    switch (method) {
      case PublishMethod.API_X: {
        const result = await postToX({
          projectId: project.id,
          config: await configFor(IntegrationKind.X_OAUTH),
          body: draft.content,
        });
        externalUrl = result.url;
        break;
      }
      case PublishMethod.GITHUB_PR: {
        const meta = (draft.meta ?? {}) as Record<string, unknown>;
        const result = await openPullRequest({
          projectId: project.id,
          config: await configFor(IntegrationKind.GITHUB_APP),
          title: card.title,
          body: `${card.rationale ?? ""}\n\n${draft.content}`,
          path: String(meta.filePath ?? "public/llms.txt"),
          content: String(meta.fileContent ?? draft.content),
        });
        externalUrl = result.url;
        break;
      }
      case PublishMethod.CMS: {
        const meta = (draft.meta ?? {}) as Record<string, unknown>;
        const result = await publishToCms(await configFor(IntegrationKind.CMS_WEBHOOK), {
          title: card.title,
          body: appendUtm(draft.content, project.url, utm),
          slug: slugify(card.title),
          ogImagePrompt: meta.ogImagePrompt ? String(meta.ogImagePrompt) : undefined,
          keyword: meta.targetKeyword ? String(meta.targetKeyword) : undefined,
        });
        externalUrl = result.url;
        payload = result.payload;
        break;
      }
      default:
        throw new BadRequestError(`Unsupported publish method: ${method}`);
    }

    const record = await db.publishRecord.create({
      data: {
        projectId: project.id,
        cardId: card.id,
        channel: card.channel,
        method,
        externalUrl,
        utm,
      },
    });

    await db.feedCard.update({
      where: { id: card.id },
      data: { status: CardStatus.PUBLISHED, approvedById: user.id },
    });

    return NextResponse.json({ record, payload, body: draft.content });
  } catch (error) {
    if (error instanceof IntegrationError) {
      // Card intentionally stays CURRENT.
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    return errorResponse(error);
  }
}

function defaultMethod(channel: Channel): PublishMethod {
  switch (channel) {
    case "X":
      return PublishMethod.API_X;
    case "SEO_GEO":
      return PublishMethod.GITHUB_PR;
    case "ARTICLE":
      return PublishMethod.CMS;
    default:
      return PublishMethod.MANUAL;
  }
}

/** Adds the UTM to any link back to the product so clicks attribute to the card. */
function appendUtm(content: string, productUrl: string, utm: string): string {
  let origin: string;
  try {
    origin = new URL(productUrl).origin;
  } catch {
    return content;
  }
  return content.replace(new RegExp(`${escapeRegExp(origin)}[^\\s)\\]]*`, "g"), (match) =>
    match.includes("?") ? `${match}&${utm}` : `${match}?${utm}`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
