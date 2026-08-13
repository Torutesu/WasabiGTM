import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { fetchPage } from "@/lib/external";
import { llm } from "@/lib/llm";
import { ContextSourceKind, FoundationDocKind } from "@/generated/prisma/client";

/** AIF-001: Living Context Layer — ingest, snapshot, detect change. */

export type IngestResult = { sourceId: string; text: string; error?: string };

export function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pulls one source's current content. Failures are returned, never thrown. */
export async function ingestSource(sourceId: string): Promise<IngestResult> {
  const source = await db.contextSource.findUnique({ where: { id: sourceId } });
  if (!source) return { sourceId, text: "", error: "source not found" };

  const config = (source.config ?? {}) as Record<string, unknown>;
  try {
    let text = "";
    switch (source.kind) {
      case ContextSourceKind.WEBSITE: {
        const url = String(config.url ?? "");
        const { status, html } = await fetchPage(url);
        if (status >= 400) throw new Error(`site returned ${status}`);
        text = htmlToText(html);
        break;
      }
      case ContextSourceKind.DOCUMENT:
        text = String(config.text ?? "");
        break;
      case ContextSourceKind.GITHUB_REPO:
        text = String(config.notes ?? `Repository: ${String(config.repo ?? "")}`);
        break;
      case ContextSourceKind.GSC:
      case ContextSourceKind.GA:
        text = `Analytics source configured: ${source.kind}`;
        break;
      case ContextSourceKind.USER_FEEDBACK:
        text = String(config.text ?? "");
        break;
    }

    await db.contextSnapshot.create({ data: { sourceId, content: text } });
    await db.contextSource.update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date(), lastDigest: digest(text), lastError: null },
    });
    return { sourceId, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.contextSource.update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date(), lastError: message },
    });
    return { sourceId, text: "", error: message };
  }
}

/** The assembled context every generation call reads from. */
export type ProjectContext = {
  productName: string;
  url: string;
  phase: string;
  sourceText: string;
  docs: Record<string, string>;
  bannedWords: string[];
  learnings: string;
  voiceProfile: Record<string, unknown> | null;
};

const BANNED_HEADINGS = /##\s*(never use|避ける|禁止|do not use|banned)/i;

/** Parses the "never use" list out of the brand voice doc. */
export function bannedWordsFrom(brandVoiceDoc: string): string[] {
  const lines = brandVoiceDoc.split("\n");
  const words: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inSection = BANNED_HEADINGS.test(line);
      continue;
    }
    if (!inSection) continue;
    const match = line.match(/^\s*[-*]\s*(.+?)\s*$/);
    if (match) {
      const word = match[1].replace(/^["'`]|["'`]$/g, "").trim();
      if (word) words.push(word);
    }
  }
  return Array.from(new Set(words));
}

export async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      foundationDocs: true,
      contextSources: { include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } },
      weeklyReviews: { orderBy: { weekStart: "desc" }, take: 1 },
      agentConfigs: true,
    },
  });

  const docs: Record<string, string> = {};
  for (const doc of project.foundationDocs) docs[doc.kind] = doc.content;

  const sourceText = project.contextSources
    .map((source) => source.snapshots[0]?.content ?? "")
    .filter(Boolean)
    .join("\n\n---\n\n");

  const review = project.weeklyReviews[0];
  const learnings = review?.learnings
    ? String((review.learnings as Record<string, unknown>).note ?? "")
    : "";

  const voiceProfile =
    (project.agentConfigs.find((c) => c.voiceProfile)?.voiceProfile as Record<
      string,
      unknown
    > | null) ?? null;

  return {
    productName: project.name,
    url: project.url,
    phase: project.phase,
    sourceText,
    docs,
    bannedWords: bannedWordsFrom(docs[FoundationDocKind.BRAND_VOICE] ?? ""),
    learnings,
    voiceProfile,
  };
}

const FOUNDATION_SCHEMA = {
  type: "object",
  properties: { content: { type: "string" } },
  required: ["content"],
  additionalProperties: false,
} as const;

/** AIF-002: generate the five foundation documents from the ingested context. */
export async function generateFoundationDocs(input: {
  projectId: string;
  productName: string;
  url: string;
  sourceText: string;
  onProgress?: (message: string) => Promise<void> | void;
}): Promise<{ generated: FoundationDocKind[]; failed: FoundationDocKind[] }> {
  const kinds: FoundationDocKind[] = [
    FoundationDocKind.PRODUCT_DESCRIPTION,
    FoundationDocKind.PRODUCT_INFO,
    FoundationDocKind.MARKETING_STRATEGY,
    FoundationDocKind.COMPETITOR_ANALYSIS,
    FoundationDocKind.BRAND_VOICE,
  ];

  const generated: FoundationDocKind[] = [];
  const failed: FoundationDocKind[] = [];

  for (const kind of kinds) {
    await input.onProgress?.(`Drafting ${label(kind)}...`);
    try {
      const result = await llm().generate<{ content: string }>({
        tier: "high",
        system:
          "You write the strategic foundation documents a growth system generates everything else from. " +
          "Ground every claim in the provided source material. Never invent facts about the product.",
        prompt: [
          `Product: ${input.productName}`,
          `URL: ${input.url}`,
          `Document to write: ${label(kind)}`,
          ``,
          `Source material gathered from the product's own surfaces:`,
          input.sourceText.slice(0, 20000),
        ].join("\n"),
        schema: FOUNDATION_SCHEMA as unknown as Record<string, unknown>,
        offlineKey: `foundation:${kind}`,
        offlineContext: {
          productName: input.productName,
          url: input.url,
          sourceText: input.sourceText,
        },
      });

      await db.foundationDoc.upsert({
        where: { projectId_kind: { projectId: input.projectId, kind } },
        update: { content: result.content, updatedBy: "agent" },
        create: { projectId: input.projectId, kind, content: result.content, updatedBy: "agent" },
      });
      generated.push(kind);
      await input.onProgress?.(`Drafting ${label(kind)}... done`);
    } catch (error) {
      failed.push(kind);
      await input.onProgress?.(
        `Drafting ${label(kind)}... failed (${error instanceof Error ? error.message : "unknown"})`,
      );
    }
  }

  return { generated, failed };
}

export function label(kind: FoundationDocKind | string): string {
  switch (kind) {
    case FoundationDocKind.PRODUCT_DESCRIPTION:
      return "Product Description";
    case FoundationDocKind.PRODUCT_INFO:
      return "Product Information";
    case FoundationDocKind.MARKETING_STRATEGY:
      return "Marketing Strategy";
    case FoundationDocKind.COMPETITOR_ANALYSIS:
      return "Competitor Analysis";
    case FoundationDocKind.BRAND_VOICE:
      return "Brand Voice";
    default:
      return String(kind);
  }
}
