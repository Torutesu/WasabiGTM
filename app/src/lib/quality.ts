import { llm } from "@/lib/llm";
import type { ProjectContext } from "@/lib/context";

/**
 * AIF-008 — the anti-slop gate.
 *
 * Every draft is judged before a human ever sees it. A failing draft is rewritten
 * with the critique attached; after MAX_ATTEMPTS the card is dropped rather than
 * shown, and the drop is recorded on the job so it is visible, not silent.
 */

export const MAX_ATTEMPTS = 3;

export type QualityVerdict = {
  genericScore: number;
  factualScore: number;
  voiceScore: number;
  communityScore: number | null;
  passed: boolean;
  critique: string;
};

const QUALITY_SCHEMA = {
  type: "object",
  properties: {
    genericScore: { type: "integer" },
    factualScore: { type: "integer" },
    voiceScore: { type: "integer" },
    communityScore: { type: ["integer", "null"] },
    passed: { type: "boolean" },
    critique: { type: "string" },
  },
  required: ["genericScore", "factualScore", "voiceScore", "communityScore", "passed", "critique"],
  additionalProperties: false,
} as const;

export async function judge(input: {
  content: string;
  channel: string;
  language: string;
  context: ProjectContext;
  /** Test seam: set by the __TEST_FORCE_QUALITY_FAIL__ instruction. */
  forceFail?: boolean;
}): Promise<QualityVerdict> {
  const { content, channel, language, context } = input;

  return llm().generate<QualityVerdict>({
    tier: "high",
    system:
      "You are an adversarial editor. Judge the draft against the brand voice, factual accuracy, " +
      "channel fit, and whether it reads as generic AI output. Be strict: a draft that could have " +
      "been written about any product in the category fails. Score 0-100 on each axis.",
    prompt: [
      `Channel: ${channel}`,
      `Language: ${language}`,
      ``,
      `Brand voice:`,
      context.docs.BRAND_VOICE ?? "(not set)",
      ``,
      `Product facts:`,
      (context.docs.PRODUCT_INFO ?? "").slice(0, 4000),
      ``,
      `Draft to judge:`,
      content,
    ].join("\n"),
    schema: QUALITY_SCHEMA as unknown as Record<string, unknown>,
    offlineKey: `quality:${channel}`,
    offlineContext: {
      draftContent: content,
      channel,
      language,
      bannedWords: context.bannedWords,
      forceFail: input.forceFail ? "1" : "",
    },
  });
}

export type GatedDraft = {
  content: string;
  meta: Record<string, unknown>;
  verdict: QualityVerdict;
  attempts: number;
  /** null when nothing cleared the bar — the caller must not surface a card. */
  accepted: boolean;
  /** Every attempt, oldest first, so the rewrite history is inspectable. */
  history: Array<{ content: string; verdict: QualityVerdict }>;
};

/**
 * Runs generate → judge → rewrite until the gate passes or attempts run out.
 * `regenerate` receives the previous critique so the rewrite is targeted.
 */
export async function runQualityGate(input: {
  channel: string;
  language: string;
  context: ProjectContext;
  forceFail?: boolean;
  generate: (critique: string | null, attempt: number) => Promise<{
    content: string;
    meta: Record<string, unknown>;
  }>;
}): Promise<GatedDraft> {
  const history: Array<{ content: string; verdict: QualityVerdict }> = [];
  let critique: string | null = null;
  let last: { content: string; meta: Record<string, unknown> } | null = null;
  let verdict: QualityVerdict | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await input.generate(critique, attempt);
    try {
      verdict = await judge({
        content: last.content,
        channel: input.channel,
        language: input.language,
        context: input.context,
        forceFail: input.forceFail,
      });
    } catch {
      // Gate failure must not block the pipeline — surface the draft flagged
      // instead, per AIF-008 fallback.
      verdict = {
        genericScore: 0,
        factualScore: 0,
        voiceScore: 0,
        communityScore: null,
        passed: true,
        critique: "Quality gate unavailable — draft is UNVERIFIED.",
      };
      history.push({ content: last.content, verdict });
      return { ...last, verdict, attempts: attempt, accepted: true, history };
    }

    history.push({ content: last.content, verdict });
    if (verdict.passed) {
      return { ...last, verdict, attempts: attempt, accepted: true, history };
    }
    critique = verdict.critique;
  }

  return {
    content: last?.content ?? "",
    meta: last?.meta ?? {},
    verdict: verdict!,
    attempts: MAX_ATTEMPTS,
    accepted: false,
    history,
  };
}
