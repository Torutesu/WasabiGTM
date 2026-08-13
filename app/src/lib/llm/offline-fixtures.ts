import type { GenerateArgs } from "./types";

/**
 * Deterministic stand-ins for model output.
 *
 * These are NOT an attempt to fake model quality. They exist so the E2E suite
 * exercises the real plumbing — context assembly, the quality gate, the feed
 * lifecycle, publishing, metrics — without depending on a live model. Every
 * fixture honours the constraints the caller passes in (banned words, language,
 * hype-word rules), because those constraints are what the tests assert on.
 */

const HYPE_WORDS = ["revolutionary", "game-changing", "ai-powered", "game changing"];

function contextString(args: GenerateArgs): string {
  return JSON.stringify(args.offlineContext ?? {});
}

function bannedWords(args: GenerateArgs): string[] {
  const ctx = (args.offlineContext ?? {}) as { bannedWords?: unknown };
  return Array.isArray(ctx.bannedWords) ? (ctx.bannedWords as string[]) : [];
}

function stripBanned(text: string, banned: string[]): string {
  let out = text;
  for (const word of banned) {
    if (!word) continue;
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    out = out.replace(re, "notable");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ctxValue(args: GenerateArgs, key: string, fallback = ""): string {
  const ctx = (args.offlineContext ?? {}) as Record<string, unknown>;
  const value = ctx[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Stable pseudo-random in [0,1) derived from a string — keeps runs reproducible. */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export async function offlineFixture<T>(args: GenerateArgs): Promise<T> {
  const key = args.offlineKey;
  const banned = bannedWords(args);

  // ---- Foundation documents -------------------------------------------
  if (key.startsWith("foundation:")) {
    const kind = key.slice("foundation:".length);
    const productName = ctxValue(args, "productName", "the product");
    const url = ctxValue(args, "url", "");
    const source = ctxValue(args, "sourceText", "");
    const price = source.match(/\$\s?\d+(?:\.\d{2})?(?:\s?\/\s?\w+)?/)?.[0] ?? "";
    const body = foundationBody(kind, productName, url, source, price);
    return { content: stripBanned(body, banned) } as T;
  }

  // ---- Channel drafts ---------------------------------------------------
  if (key.startsWith("draft:")) {
    const channel = key.slice("draft:".length);
    const language = ctxValue(args, "language", "en");
    const productName = ctxValue(args, "productName", "the product");
    const angle = ctxValue(args, "angle", "product positioning");
    const learnings = ctxValue(args, "learnings", "");
    const index = ctxValue(args, "index", "0");

    const draft = draftBody({ channel, language, productName, angle, index });
    return {
      title: draftTitle(channel, angle, language, productName),
      content: stripBanned(stripHype(draft, channel), banned),
      rationale: rationaleFor(channel, angle, learnings, language),
      priority: hashUnit(key + index) > 0.6 ? "HIGH" : "MEDIUM",
      difficulty: channel === "ARTICLE" ? "MEDIUM" : "EASY",
    } as T;
  }

  // ---- Quality gate ------------------------------------------------------
  if (key.startsWith("quality:")) {
    const content = ctxValue(args, "draftContent", "");
    const banned2 = bannedWords(args);
    const language = ctxValue(args, "language", "en");
    const channel = ctxValue(args, "channel", "X");
    const forceFail = ctxValue(args, "forceFail", "") === "1";

    const violations: string[] = [];
    for (const word of banned2) {
      if (word && new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(content)) {
        violations.push(`uses banned term "${word}"`);
      }
    }
    if (channel === "LAUNCH" || channel === "REDDIT") {
      for (const hype of HYPE_WORDS) {
        if (new RegExp(`\\b${escapeRegExp(hype)}\\b`, "i").test(content)) {
          violations.push(`uses hype word "${hype}"`);
        }
      }
    }
    if (language === "ja" && /\b(the|and|with|your)\b/i.test(content)) {
      violations.push("reads as machine-translated English");
    }
    if (content.trim().length < 12) violations.push("too short to be useful");

    const voiceScore = forceFail ? 20 : Math.max(0, 96 - violations.length * 30);
    const genericScore = forceFail ? 15 : 88 + Math.round(hashUnit(content) * 8);
    const factualScore = forceFail ? 30 : 92 + Math.round(hashUnit(content + "f") * 6);
    const passed = !forceFail && violations.length === 0;

    return {
      genericScore,
      factualScore,
      voiceScore,
      communityScore: channel === "REDDIT" || channel === "LAUNCH" ? (passed ? 90 : 40) : null,
      passed,
      critique: passed
        ? "Meets brand voice, factual, and channel-fit bars."
        : `Rewrite required: ${violations.join("; ") || "did not meet the quality bar"}.`,
    } as T;
  }

  // ---- Site audit --------------------------------------------------------
  if (key.startsWith("audit:")) {
    const kind = key.slice("audit:".length);
    const found = ctxValue(args, "findings", "");
    const parsed = found ? (JSON.parse(found) as AuditFinding[]) : [];
    const score = Math.max(0, 100 - parsed.length * 9);
    return {
      score,
      issues: parsed.map((f, i) => ({
        id: `${kind.toLowerCase()}-${i + 1}`,
        severity: f.severity,
        page: f.page,
        title: f.title,
        detail: f.detail,
        fixSuggestion: f.fixSuggestion,
      })),
    } as T;
  }

  // ---- Weekly review -----------------------------------------------------
  if (key === "weekly-review") {
    const stats = ctxValue(args, "stats", "[]");
    const rows = JSON.parse(stats) as ChannelStat[];
    if (rows.length === 0) {
      return {
        content: "Not enough data — keep publishing. No conclusions can be drawn from this week.",
        learnings: { angles: [], channels: [], note: "insufficient-data" },
      } as T;
    }
    const best = [...rows].sort((a, b) => b.clicks - a.clicks)[0];
    return {
      content: [
        `## What worked`,
        `${best.channel} drove the most clicks this week (${best.clicks} from ${best.published} published).`,
        best.topAngle ? `The "${best.topAngle}" angle outperformed the rest.` : "",
        ``,
        `## Next week`,
        `Weight generation toward ${best.channel}${best.topAngle ? ` and the "${best.topAngle}" angle` : ""}.`,
      ]
        .filter(Boolean)
        .join("\n"),
      learnings: {
        angles: best.topAngle ? [best.topAngle] : [],
        channels: [best.channel],
        note: `${best.channel} led on clicks`,
      },
    } as T;
  }

  // ---- Context change detection -----------------------------------------
  if (key === "context-diff") {
    const before = ctxValue(args, "before", "");
    const after = ctxValue(args, "after", "");
    const changed = before.trim() !== after.trim();
    return {
      changed,
      summary: changed
        ? "The source content changed in a way that affects the product facts."
        : "No meaningful change.",
      proposedContent: changed ? after.slice(0, 4000) : "",
    } as T;
  }

  // ---- Voice profile -----------------------------------------------------
  if (key === "voice-profile") {
    const edits = ctxValue(args, "edits", "");
    return {
      traits: ["direct", "concrete", "no hype"],
      avoid: HYPE_WORDS,
      note: edits ? "Learned from human edits and archive reasons." : "Bootstrapped from brand voice.",
    } as T;
  }

  throw new Error(`No offline fixture for key: ${key} (context ${contextString(args)})`);
}

export async function offlineCompletion(args: Omit<GenerateArgs, "schema">): Promise<string> {
  const key = args.offlineKey;
  if (key === "chat") {
    const question = ctxValue(args as GenerateArgs, "question", "");
    const refs = ctxValue(args as GenerateArgs, "refNames", "");
    const learnings = ctxValue(args as GenerateArgs, "learnings", "");
    const lines = [
      refs
        ? `Reading ${refs}, here is where I would focus.`
        : `Here is where I would focus.`,
      learnings ? `Last week's signal: ${learnings}` : "",
      question ? `On "${question}": prioritise the channel with the shortest path to a signed-up user, and keep the次の一手 concrete.` : "",
    ].filter(Boolean);
    return lines.join("\n\n");
  }
  if (key === "daily-rundown") {
    const count = ctxValue(args as GenerateArgs, "cardCount", "0");
    return `Good morning. ${count} opportunities are waiting in the feed. Start with the highest-priority card, then clear the SEO/GEO fixes.`;
  }
  return "";
}

// ------------------------------------------------------------------ helpers

type AuditFinding = {
  severity: string;
  page: string;
  title: string;
  detail: string;
  fixSuggestion: string;
};

type ChannelStat = {
  channel: string;
  published: number;
  clicks: number;
  topAngle?: string;
};

function stripHype(text: string, channel: string): string {
  if (channel !== "LAUNCH" && channel !== "REDDIT") return text;
  let out = text;
  for (const hype of HYPE_WORDS) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(hype)}\\b`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function foundationBody(
  kind: string,
  productName: string,
  url: string,
  source: string,
  price: string,
): string {
  const firstLine = source.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  switch (kind) {
    case "PRODUCT_DESCRIPTION":
      return [
        `# ${productName}`,
        ``,
        firstLine,
        ``,
        url ? `Site: ${url}` : "",
        price ? `Price: ${price}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "PRODUCT_INFO":
      return [
        `# Product information`,
        ``,
        `- Name: ${productName}`,
        url ? `- URL: ${url}` : "",
        price ? `- Pricing: ${price}` : "- Pricing: not published",
        `- Source of truth: the connected context sources, refreshed on every sync.`,
        ``,
        `## Extracted facts`,
        source.slice(0, 1200),
      ]
        .filter(Boolean)
        .join("\n");
    case "MARKETING_STRATEGY":
      return [
        `# Marketing strategy`,
        ``,
        `## Channel priority`,
        `1. Launch surfaces (Hacker News, Product Hunt) — highest leverage pre-launch.`,
        `2. X — founder voice, daily cadence.`,
        `3. Reddit — answer real questions where ${productName} genuinely fits.`,
        `4. SEO/GEO — compounding, start now so it lands later.`,
        `5. Long-form articles — comparison and use-case pages.`,
        ``,
        `## Messaging`,
        `Lead with the outcome the user gets, not the mechanism.`,
      ].join("\n");
    case "COMPETITOR_ANALYSIS":
      return [
        `# Competitor analysis`,
        ``,
        `Competitors are tracked from the connected context sources and refreshed on sync.`,
        `For each: what they promise, where they are weak, and the wedge for ${productName}.`,
      ].join("\n");
    case "BRAND_VOICE":
      return [
        `# Brand voice`,
        ``,
        `## Tone`,
        `Direct. Concrete. States the outcome first.`,
        ``,
        `## Never use`,
        `- revolutionary`,
        `- game-changing`,
        `- AI-powered`,
        ``,
        `## Example`,
        `"${productName} remembers your day, then acts on it."`,
      ].join("\n");
    default:
      return `# ${kind}\n\n${firstLine}`;
  }
}

function draftTitle(channel: string, angle: string, language: string, productName: string): string {
  const ja = language === "ja";
  switch (channel) {
    case "X":
      return ja ? `ツイート: ${angle}` : `Tweet: ${angle}`;
    case "REDDIT":
      return ja ? `Reddit返信: ${angle}` : `Reddit reply: ${angle}`;
    case "ARTICLE":
      return ja ? `記事: ${angle}` : `Article: ${angle}`;
    case "LAUNCH":
      return ja ? `ローンチ: ${productName}` : `Show HN: ${productName}`;
    case "SEO_GEO":
      return ja ? `修正: ${angle}` : `Fix: ${angle}`;
    default:
      return angle;
  }
}

function draftBody(input: {
  channel: string;
  language: string;
  productName: string;
  angle: string;
  index: string;
}): string {
  const { channel, language, productName, angle } = input;
  const ja = language === "ja";

  switch (channel) {
    case "X":
      return ja
        ? `${productName} を作っていて気づいたこと。${angle}という観点は、実際に使う人の一日を見ないと出てこない。\n\n記録するだけのツールと、記録から動くツールは別物です。`
        : `Building ${productName} taught me this: ${angle} only shows up once you watch how someone actually spends a day.\n\nA tool that remembers is not the same as a tool that acts.`;
    case "REDDIT":
      return ja
        ? `同じ問題にぶつかったことがあります。まず質問に答えると、${angle}が原因であることが多いです。\n\n手順を書いておきます。うまくいかなければ詳しく書きます。`
        : `Ran into this exact thing. To answer the question first: ${angle} is usually the cause, not the symptom you are seeing.\n\nHere is the sequence that worked for me. Happy to go deeper if it does not.`;
    case "ARTICLE":
      return ja
        ? [
            `# ${angle}`,
            ``,
            `## 要点`,
            `${productName} を運用するうえで、${angle}は最初に決めるべき論点です。`,
            ``,
            `## 背景`,
            `多くのチームがここを後回しにします。理由は単純で、成果が出るまでに時間がかかるからです。`,
            ``,
            `## 実際にやること`,
            `1. 現状を計測する`,
            `2. 一つだけ変える`,
            `3. 一週間後に同じ指標を見る`,
            ``,
            `## まとめ`,
            `決めるのは早いほうがいい。やり直すコストは時間とともに上がります。`,
          ].join("\n")
        : [
            `# ${angle}`,
            ``,
            `## The short version`,
            `If you run ${productName}, ${angle} is the decision to make first.`,
            ``,
            `## Why teams postpone it`,
            `The payoff is slow, so it loses every prioritisation argument against something shippable this week. That is exactly why it compounds against you.`,
            ``,
            `## What to actually do`,
            `1. Measure where you are today, with one number you trust.`,
            `2. Change exactly one thing.`,
            `3. Look at the same number a week later.`,
            ``,
            `Most of the value is in step one. Teams that skip it end up arguing about opinions instead of movement.`,
            ``,
            `## What this costs you if you wait`,
            `Rework gets more expensive over time, because every downstream decision assumed the thing you did not decide.`,
            ``,
            `## Closing`,
            `Decide early, measure honestly, and let the compounding do the work.`,
          ].join("\n");
    case "LAUNCH":
      return ja
        ? `${productName} を公開しました。\n\n一日の作業を受動的に記録し、その記憶から実際に行動するエージェントです。手動の入力は要りません。\n\n作った理由、詰まったところ、まだ弱いところを書きました。質問があればここで答えます。`
        : `I built ${productName} because every tool I tried remembered things and then did nothing with them.\n\nIt captures what you do passively and acts on that memory. No manual note-taking step.\n\nHappy to answer questions about the approach, what broke along the way, and where it is still weak.`;
    case "SEO_GEO":
      return `${angle}\n\nApply the suggested change, then re-run the audit to confirm the score moves.`;
    default:
      return `${angle}`;
  }
}

function rationaleFor(channel: string, angle: string, learnings: string, language: string): string {
  const base = (() => {
    switch (channel) {
      case "X":
        return `Rotating to the "${angle}" angle`;
      case "REDDIT":
        return `A live thread matches "${angle}" and the product genuinely helps`;
      case "ARTICLE":
        return `Keyword gap around "${angle}" with no strong page yet`;
      case "LAUNCH":
        return `Project is pre-launch — launch surfaces are the highest-leverage channel right now`;
      case "SEO_GEO":
        return `Audit flagged "${angle}"`;
      default:
        return angle;
    }
  })();
  const lang = language === "ja" ? " (ja)" : "";
  return learnings ? `${base}${lang}. Weighted by last week's learnings: ${learnings}` : `${base}${lang}.`;
}
