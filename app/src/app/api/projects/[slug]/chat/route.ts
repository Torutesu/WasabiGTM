import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { llm } from "@/lib/llm";
import { loadProjectContext } from "@/lib/context";
import { FoundationDocKind } from "@wasabi/prisma/client";

/** AIF-011 — the CMO chat. Context refs are surfaced so the answer is auditable. */

const MENTIONS: Record<string, FoundationDocKind> = {
  strategy: FoundationDocKind.MARKETING_STRATEGY,
  product: FoundationDocKind.PRODUCT_DESCRIPTION,
  info: FoundationDocKind.PRODUCT_INFO,
  competitors: FoundationDocKind.COMPETITOR_ANALYSIS,
  voice: FoundationDocKind.BRAND_VOICE,
};

/** Any @mention in the message pins that document into the answer's context. */
export function parseMentions(message: string): FoundationDocKind[] {
  const refs = new Set<FoundationDocKind>();
  for (const [token, kind] of Object.entries(MENTIONS)) {
    if (new RegExp(`@${token}\\b`, "i").test(message)) refs.add(kind);
  }
  return Array.from(refs);
}

/** Detects a request that should produce a card rather than only prose. */
export function looksLikeGenerationRequest(message: string): boolean {
  return /(ツイート|tweet|投稿|post|draft|案を?作|書いて|write me)/i.test(message);
}

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/chat">) {
  const { slug } = await ctx.params;
  const threadId = new URL(request.url).searchParams.get("threadId");

  return withUser(async ({ user }) => {
    const project = await projectBySlug(slug);
    const threads = await db.chatThread.findMany({
      where: { projectId: project.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const messages = threadId
      ? await db.chatMessage.findMany({
          where: { threadId },
          orderBy: { createdAt: "asc" },
        })
      : [];
    return { threads, messages };
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/chat">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    threadId?: string;
    content?: string;
  };

  return withUser(async ({ user }) => {
    if (!body.content?.trim()) throw new BadRequestError("content is required");
    const project = await projectBySlug(slug);

    const thread = body.threadId
      ? await db.chatThread.findFirstOrThrow({
          where: { id: body.threadId, projectId: project.id },
        })
      : await db.chatThread.create({
          data: {
            projectId: project.id,
            userId: user.id,
            title: body.content.slice(0, 60),
          },
        });

    const refs = parseMentions(body.content);
    await db.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "user",
        content: body.content,
        contextRefs: refs as never,
      },
    });

    const context = await loadProjectContext(project.id);
    const refDocs = refs.length
      ? refs.map((kind) => `## ${kind}\n${context.docs[kind] ?? "(not generated)"}`).join("\n\n")
      : Object.entries(context.docs)
          .map(([kind, content]) => `## ${kind}\n${content.slice(0, 1200)}`)
          .join("\n\n");

    let answer: string;
    try {
      answer = await llm().complete({
        tier: "high",
        system:
          "You are the growth lead for this product. You have its strategy documents, what worked " +
          "last week, and its current metrics. Answer directly and recommend one next action. " +
          "Never invent metrics you were not given.",
        prompt: [
          `Question: ${body.content}`,
          ``,
          `Context:`,
          refDocs.slice(0, 12000),
          context.learnings ? `\nLast week's learnings: ${context.learnings}` : "",
        ].join("\n"),
        offlineKey: "chat",
        offlineContext: {
          question: body.content,
          refNames: refs.join(", "),
          learnings: context.learnings,
        },
      });
    } catch {
      answer = "I could not reach the model just now. Your message is saved — retry when ready.";
    }

    const suggestion = looksLikeGenerationRequest(body.content)
      ? {
          channel: "X",
          type: "tweet",
          language: project.languages[0] ?? "en",
          content: answer,
        }
      : null;

    const message = await db.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: answer,
        contextRefs: {
          docs: refs.length ? refs : Object.keys(context.docs),
          suggestion,
        } as never,
      },
    });

    return { thread, message, suggestion };
  });
}
