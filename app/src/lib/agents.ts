import { db } from "@/lib/db";
import { llm } from "@/lib/llm";
import type { ProjectContext } from "@/lib/context";
import { runQualityGate } from "@/lib/quality";
import { findRedditThreads, type RedditThread } from "@/lib/external";
import { Channel, Difficulty, DraftAuthor, Priority } from "@/generated/prisma/client";

/**
 * AIF-003..007 — the channel agents.
 *
 * Every agent produces candidate cards; each candidate goes through the quality
 * gate (AIF-008) before it is persisted. Candidates that never clear the bar are
 * returned as drops so the caller can record them on the job.
 */

export const FORCE_FAIL_TOKEN = "__TEST_FORCE_QUALITY_FAIL__";

export type Candidate = {
  channel: Channel;
  type: string;
  language: string;
  title: string;
  content: string;
  rationale: string;
  priority: Priority;
  difficulty: Difficulty;
  meta: Record<string, unknown>;
  sourceRef?: Record<string, unknown>;
};

export type AgentOutput = { created: number; dropped: number; notes: string[] };

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    rationale: { type: "string" },
    priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
  },
  required: ["title", "content", "rationale", "priority", "difficulty"],
  additionalProperties: false,
} as const;

type DraftShape = {
  title: string;
  content: string;
  rationale: string;
  priority: string;
  difficulty: string;
};

const X_ANGLES = [
  "product positioning",
  "an industry observation",
  "an engagement question",
  "a reaction to something current",
  "promoting a piece of content",
];

const ARTICLE_ANGLES = [
  "how to choose between the obvious options",
  "what the category gets wrong",
  "a concrete workflow walkthrough",
];

/**
 * Runs one channel agent. `quota` cards per enabled language.
 */
export async function runChannelAgent(input: {
  projectId: string;
  cycleId: string;
  channel: Channel;
  quota: number;
  languages: string[];
  instructions: string;
  channelConfig: Record<string, unknown>;
  context: ProjectContext;
}): Promise<AgentOutput> {
  const forceFail = input.instructions.includes(FORCE_FAIL_TOKEN);
  const candidates = await buildCandidates(input);

  let created = 0;
  let dropped = 0;
  const notes: string[] = [];

  for (const candidate of candidates) {
    const gated = await runQualityGate({
      channel: candidate.channel,
      language: candidate.language,
      context: input.context,
      forceFail,
      generate: async (critique, attempt) => {
        if (attempt === 1) return { content: candidate.content, meta: candidate.meta };
        // Rewrite pass: hand the critique back to the model.
        const rewritten = await llm().generate<DraftShape>({
          tier: "mid",
          system: rewriteSystem(candidate.channel),
          prompt: [
            `The previous draft did not pass review.`,
            `Reviewer critique: ${critique ?? "unspecified"}`,
            ``,
            `Brand voice:`,
            input.context.docs.BRAND_VOICE ?? "",
            ``,
            `Previous draft:`,
            candidate.content,
            ``,
            `Rewrite it to address the critique. Keep the same intent and channel.`,
          ].join("\n"),
          schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
          offlineKey: `draft:${candidate.channel}`,
          offlineContext: {
            language: candidate.language,
            productName: input.context.productName,
            angle: String(candidate.meta.angle ?? ""),
            index: String(attempt),
            bannedWords: input.context.bannedWords,
            learnings: input.context.learnings,
          },
        });
        return { content: rewritten.content, meta: candidate.meta };
      },
    });

    if (!gated.accepted) {
      dropped += 1;
      notes.push(
        `${candidate.channel}/${candidate.language}: dropped (quality) after ${gated.attempts} attempts — ${gated.verdict.critique}`,
      );
      continue;
    }

    const card = await db.feedCard.create({
      data: {
        projectId: input.projectId,
        cycleId: input.cycleId,
        channel: candidate.channel,
        type: candidate.type,
        title: candidate.title,
        language: candidate.language,
        rationale: candidate.rationale,
        priority: candidate.priority,
        difficulty: candidate.difficulty,
        sourceRef: (candidate.sourceRef ?? {}) as never,
      },
    });

    // Persist each gate attempt so the rewrite history is inspectable.
    let version = 0;
    for (const step of gated.history) {
      version += 1;
      const isFinal = version === gated.history.length;
      const draft = await db.draft.create({
        data: {
          cardId: card.id,
          version,
          content: step.content,
          meta: (candidate.meta ?? {}) as never,
          authorType: version === 1 ? DraftAuthor.AGENT : DraftAuthor.AGENT_FIX,
        },
      });
      if (isFinal || !step.verdict.passed) {
        await db.qualityReview.create({
          data: {
            draftId: draft.id,
            genericScore: step.verdict.genericScore,
            factualScore: step.verdict.factualScore,
            voiceScore: step.verdict.voiceScore,
            communityScore: step.verdict.communityScore,
            passed: step.verdict.passed,
            critique: step.verdict.critique,
          },
        });
      }
    }

    created += 1;
  }

  return { created, dropped, notes };
}

async function buildCandidates(input: {
  channel: Channel;
  quota: number;
  languages: string[];
  channelConfig: Record<string, unknown>;
  instructions: string;
  context: ProjectContext;
}): Promise<Candidate[]> {
  switch (input.channel) {
    case Channel.X:
      return buildSimple(input, X_ANGLES, "tweet");
    case Channel.ARTICLE:
      return buildSimple(input, ARTICLE_ANGLES, "article");
    case Channel.LAUNCH:
      return buildLaunch(input);
    case Channel.REDDIT:
      return buildReddit(input);
    case Channel.SEO_GEO:
      return [];
    default:
      return [];
  }
}

/** X and article agents: rotate through angles, one card per angle per language. */
async function buildSimple(
  input: {
    channel: Channel;
    quota: number;
    languages: string[];
    instructions: string;
    context: ProjectContext;
  },
  angles: string[],
  type: string,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const language of input.languages) {
    for (let i = 0; i < input.quota; i += 1) {
      const angle = angles[i % angles.length];
      const draft = await llm().generate<DraftShape>({
        tier: "mid",
        system: draftSystem(input.channel, language),
        prompt: draftPrompt({
          channel: input.channel,
          language,
          angle,
          instructions: input.instructions,
          context: input.context,
        }),
        schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
        offlineKey: `draft:${input.channel}`,
        offlineContext: {
          language,
          productName: input.context.productName,
          angle,
          index: String(i),
          bannedWords: input.context.bannedWords,
          learnings: input.context.learnings,
        },
      });

      out.push({
        channel: input.channel,
        type,
        language,
        title: draft.title,
        content: draft.content,
        rationale: draft.rationale,
        priority: toPriority(draft.priority),
        difficulty: toDifficulty(draft.difficulty),
        meta:
          input.channel === Channel.ARTICLE
            ? { angle, targetKeyword: angle, ogImagePrompt: `Cover image for: ${draft.title}` }
            : { angle },
      });
    }
  }
  return out;
}

/** AIF-007: launch support. Three variants on one card, plus timing guidance. */
async function buildLaunch(input: {
  quota: number;
  languages: string[];
  instructions: string;
  context: ProjectContext;
}): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const axes = ["the technical problem", "the user outcome", "what makes it different"];

  for (const language of input.languages.slice(0, 1)) {
    const variants: Array<{ axis: string; title: string; content: string }> = [];
    for (const axis of axes) {
      const draft = await llm().generate<DraftShape>({
        tier: "high",
        system:
          "You write launch posts for Hacker News and Product Hunt. Launches are one-shot, so the " +
          "title carries most of the weight. Never use hype words (revolutionary, game-changing, " +
          "AI-powered). Say what it does and what you learned building it.",
        prompt: draftPrompt({
          channel: Channel.LAUNCH,
          language,
          angle: axis,
          instructions: input.instructions,
          context: input.context,
        }),
        schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
        offlineKey: `draft:LAUNCH`,
        offlineContext: {
          language,
          productName: input.context.productName,
          angle: axis,
          index: String(variants.length),
          bannedWords: input.context.bannedWords,
          learnings: input.context.learnings,
        },
      });
      variants.push({ axis, title: draft.title, content: draft.content });
    }

    out.push({
      channel: Channel.LAUNCH,
      type: "hn_show",
      language,
      title: variants[0].title,
      content: variants[0].content,
      rationale: `Project is ${input.context.phase} — launch surfaces are the highest-leverage channel right now.`,
      priority: Priority.HIGH,
      difficulty: Difficulty.MEDIUM,
      meta: {
        angle: axes[0],
        variants,
        timing: "Tue–Thu, 08:00–10:00 US Eastern. Post, then stay in the thread for two hours.",
      },
    });
  }
  return out;
}

/** AIF-004: Reddit discovery. Drafts a reply; posting is deliberately not implemented. */
async function buildReddit(input: {
  quota: number;
  languages: string[];
  instructions: string;
  channelConfig: Record<string, unknown>;
  context: ProjectContext;
}): Promise<Candidate[]> {
  const subreddits = toStringArray(input.channelConfig.subreddits, [
    "macapps",
    "productivity",
    "SideProject",
  ]);
  const keywords = toStringArray(input.channelConfig.keywords, [
    "workflow",
    "context switching",
    "note taking",
  ]);

  let threads: RedditThread[] = [];
  try {
    threads = await findRedditThreads({ subreddits, keywords, limit: input.quota });
  } catch {
    return [];
  }

  const out: Candidate[] = [];
  const language = input.languages[0] ?? "en";
  for (const thread of threads) {
    const draft = await llm().generate<DraftShape>({
      tier: "mid",
      system:
        "You draft Reddit replies that a founder would post themselves. Answer the question first. " +
        "Mention the product only if it genuinely solves the problem, and then minimally — or not at " +
        "all. Match the subreddit's register. Never write marketing copy.",
      prompt: [
        `Subreddit: r/${thread.subreddit}`,
        `Community rules: ${thread.rules}`,
        `Thread title: ${thread.title}`,
        `Thread body: ${thread.excerpt}`,
        ``,
        `Product context:`,
        (input.context.docs.PRODUCT_DESCRIPTION ?? "").slice(0, 1500),
        ``,
        `Brand voice:`,
        (input.context.docs.BRAND_VOICE ?? "").slice(0, 1500),
        input.instructions ? `\nExtra instructions: ${input.instructions}` : "",
      ].join("\n"),
      schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
      offlineKey: "draft:REDDIT",
      offlineContext: {
        language,
        productName: input.context.productName,
        angle: thread.title,
        index: thread.id,
        bannedWords: input.context.bannedWords,
        learnings: input.context.learnings,
      },
    });

    out.push({
      channel: Channel.REDDIT,
      type: "reddit_reply",
      language,
      title: `r/${thread.subreddit}: ${thread.title}`.slice(0, 140),
      content: draft.content,
      rationale: draft.rationale,
      priority: toPriority(draft.priority),
      difficulty: Difficulty.EASY,
      meta: { angle: thread.title },
      sourceRef: {
        threadUrl: thread.url,
        subreddit: thread.subreddit,
        title: thread.title,
        excerpt: thread.excerpt,
        rules: thread.rules,
      },
    });
  }
  return out;
}

// ------------------------------------------------------------------ prompts

function draftSystem(channel: Channel, language: string): string {
  const lang =
    language === "ja"
      ? "Write in natural Japanese as a native speaker would — not a translation of English. Avoid katakana-transliterated jargon and repeated 体言止め."
      : "Write in English.";
  const base = (() => {
    switch (channel) {
      case Channel.X:
        return "You write a founder's own posts on X. One idea per post, concrete, no thread-bait.";
      case Channel.ARTICLE:
        return "You write long-form articles that earn a link. Lead with the answer, then the reasoning.";
      default:
        return "You draft marketing content for a specific product.";
    }
  })();
  return `${base} ${lang} Never use hype words. Never write something that could be about any product in the category.`;
}

function draftPrompt(input: {
  channel: Channel;
  language: string;
  angle: string;
  instructions: string;
  context: ProjectContext;
}): string {
  return [
    `Product: ${input.context.productName}`,
    `Angle for this piece: ${input.angle}`,
    `Language: ${input.language}`,
    ``,
    `Product description:`,
    (input.context.docs.PRODUCT_DESCRIPTION ?? "").slice(0, 2000),
    ``,
    `Brand voice (follow it exactly):`,
    (input.context.docs.BRAND_VOICE ?? "").slice(0, 2000),
    ``,
    `Marketing strategy:`,
    (input.context.docs.MARKETING_STRATEGY ?? "").slice(0, 1500),
    input.context.learnings ? `\nWhat worked last week: ${input.context.learnings}` : "",
    input.context.voiceProfile
      ? `\nLearned founder voice: ${JSON.stringify(input.context.voiceProfile)}`
      : "",
    input.instructions ? `\nExtra instructions: ${input.instructions}` : "",
    ``,
    `Explain in the rationale why this piece is worth publishing now.`,
  ].join("\n");
}

function rewriteSystem(channel: Channel): string {
  return `You revise a rejected ${channel} draft. Address every point in the critique. Keep what worked.`;
}

// ------------------------------------------------------------------ helpers

function toPriority(value: string): Priority {
  if (value === "HIGH") return Priority.HIGH;
  if (value === "LOW") return Priority.LOW;
  return Priority.MEDIUM;
}

function toDifficulty(value: string): Difficulty {
  if (value === "HARD") return Difficulty.HARD;
  if (value === "MEDIUM") return Difficulty.MEDIUM;
  return Difficulty.EASY;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "string") && value.length > 0) {
    return value as string[];
  }
  return fallback;
}
