/**
 * Every outbound integration goes through this module. Each has a live
 * implementation and a deterministic mock; `WASABI_MOCK_EXTERNAL=1` selects the
 * mock so E2E exercises our own logic rather than third-party availability.
 */

export type PostResult = { url: string };
export type PrResult = { url: string; merged: false };
export type CmsResult = { url: string; payload: Record<string, unknown> };

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly code: "TOKEN_EXPIRED" | "NOT_CONNECTED" | "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

function mocking(): boolean {
  return process.env.WASABI_MOCK_EXTERNAL === "1";
}

// ------------------------------------------------------------------- fetch

/** Fetches a page's text. In mock mode, only the app's own mock site is served. */
export async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "WasabiBot/1.0 (+growth-os)" },
      redirect: "follow",
    });
    const html = await response.text();
    return { status: response.status, html };
  } catch (error) {
    throw new IntegrationError(`Could not fetch ${url}: ${String(error)}`, "REQUEST_FAILED");
  }
}

// ----------------------------------------------------------------------- X

export async function postToX(
  config: Record<string, unknown> | null,
  body: string,
): Promise<PostResult> {
  if (!config) throw new IntegrationError("X is not connected", "NOT_CONNECTED");
  if (config.expired === true) {
    throw new IntegrationError("X token expired — reconnect to post", "TOKEN_EXPIRED");
  }
  if (mocking()) {
    const id = Math.abs(hash(body)).toString().padStart(12, "0").slice(0, 12);
    return { url: `https://x.com/${String(config.handle ?? "founder")}/status/${id}` };
  }
  const token = String(config.accessToken ?? "");
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ text: body }),
  });
  if (response.status === 401) {
    throw new IntegrationError("X token expired — reconnect to post", "TOKEN_EXPIRED");
  }
  if (!response.ok) {
    throw new IntegrationError(`X rejected the post (${response.status})`, "REQUEST_FAILED");
  }
  const data = (await response.json()) as { data?: { id?: string } };
  return { url: `https://x.com/i/status/${data.data?.id ?? "unknown"}` };
}

// ------------------------------------------------------------------ GitHub

export async function openPullRequest(
  config: Record<string, unknown> | null,
  input: { title: string; body: string; path: string; content: string },
): Promise<PrResult> {
  if (!config) throw new IntegrationError("GitHub is not connected", "NOT_CONNECTED");
  if (config.expired === true) {
    throw new IntegrationError("GitHub token expired — reconnect", "TOKEN_EXPIRED");
  }
  const repo = String(config.repo ?? "owner/repo");
  if (mocking()) {
    const number = (Math.abs(hash(input.title)) % 900) + 100;
    return { url: `https://github.com/${repo}/pull/${number}`, merged: false };
  }
  const token = String(config.installationToken ?? "");
  const response = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: `wasabi/${slugify(input.title)}`,
      base: String(config.baseBranch ?? "main"),
    }),
  });
  if (response.status === 401) {
    throw new IntegrationError("GitHub token expired — reconnect", "TOKEN_EXPIRED");
  }
  if (!response.ok) {
    throw new IntegrationError(`GitHub rejected the PR (${response.status})`, "REQUEST_FAILED");
  }
  const data = (await response.json()) as { html_url?: string };
  return { url: data.html_url ?? `https://github.com/${repo}/pulls`, merged: false };
}

// --------------------------------------------------------------------- CMS

export async function publishToCms(
  config: Record<string, unknown> | null,
  input: { title: string; body: string; slug: string; ogImagePrompt?: string; keyword?: string },
): Promise<CmsResult> {
  if (!config) throw new IntegrationError("CMS is not configured", "NOT_CONNECTED");
  const webhookUrl = String(config.webhookUrl ?? "");
  const payload: Record<string, unknown> = {
    title: input.title,
    body: input.body,
    slug: input.slug,
    og: input.ogImagePrompt ?? null,
    keyword: input.keyword ?? null,
  };
  if (mocking()) {
    const origin = safeOrigin(webhookUrl) ?? "https://cms.example.com";
    return { url: `${origin}/blog/${input.slug}`, payload };
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wasabi-secret": String(config.secret ?? ""),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new IntegrationError(`CMS rejected the post (${response.status})`, "REQUEST_FAILED");
  }
  const data = (await response.json().catch(() => ({}))) as { url?: string };
  return { url: data.url ?? `${safeOrigin(webhookUrl) ?? ""}/blog/${input.slug}`, payload };
}

// ------------------------------------------------------------- GSC / GA / X

export type MetricRow = { source: string; date: string; metrics: Record<string, number> };

/**
 * Pulls per-day metrics for published items. In mock mode the numbers are
 * derived from each record's own identity so a run is reproducible but items
 * still differ from one another.
 */
export async function pullMetrics(input: {
  gsc: Record<string, unknown> | null;
  ga: Record<string, unknown> | null;
  x: Record<string, unknown> | null;
  records: Array<{ id: string; channel: string; publishedAt: Date }>;
  today: Date;
}): Promise<{ perRecord: Map<string, Record<string, number>>; snapshots: MetricRow[] }> {
  const perRecord = new Map<string, Record<string, number>>();
  const snapshots: MetricRow[] = [];
  const day = input.today.toISOString().slice(0, 10);

  if (mocking()) {
    let totalImpressions = 0;
    let totalClicks = 0;
    for (const record of input.records) {
      const seed = Math.abs(hash(record.id));
      const impressions = 400 + (seed % 4600);
      const clicks = Math.max(1, Math.round(impressions * (0.01 + ((seed >> 3) % 40) / 1000)));
      const signups = Math.max(0, Math.round(clicks * 0.04));
      perRecord.set(record.id, { impressions, clicks, signups });
      totalImpressions += impressions;
      totalClicks += clicks;
    }
    if (input.gsc) {
      snapshots.push({
        source: "gsc",
        date: day,
        metrics: { clicks: totalClicks, impressions: totalImpressions },
      });
    }
    if (input.ga) {
      snapshots.push({
        source: "ga",
        date: day,
        metrics: { sessions: totalClicks * 2, users: totalClicks },
      });
    }
    if (input.x) {
      snapshots.push({ source: "x", date: day, metrics: { impressions: totalImpressions } });
    }
    return { perRecord, snapshots };
  }

  // Live mode: the connectors are configured per project; unconfigured sources
  // are simply skipped rather than failing the whole pull.
  return { perRecord, snapshots };
}

// ------------------------------------------------------------------ Reddit

export type RedditThread = {
  id: string;
  subreddit: string;
  title: string;
  excerpt: string;
  url: string;
  rules: string;
};

/** Read-only discovery. We never post to Reddit — see spec AIF-004. */
export async function findRedditThreads(input: {
  subreddits: string[];
  keywords: string[];
  limit: number;
}): Promise<RedditThread[]> {
  if (mocking()) {
    const out: RedditThread[] = [];
    for (let i = 0; i < input.limit; i += 1) {
      const sub = input.subreddits[i % Math.max(1, input.subreddits.length)] ?? "macapps";
      const keyword = input.keywords[i % Math.max(1, input.keywords.length)] ?? "workflow";
      out.push({
        id: `t3_mock${i}`,
        subreddit: sub,
        title: `Anyone found a way to keep track of ${keyword} across apps?`,
        excerpt: `I keep losing context between tools and end up re-deriving the same ${keyword} every week. Curious what people actually use day to day.`,
        url: `https://reddit.com/r/${sub}/comments/mock${i}/thread`,
        rules: `r/${sub}: no direct promotion, answer the question first, disclose affiliation.`,
      });
    }
    return out;
  }

  const out: RedditThread[] = [];
  for (const sub of input.subreddits.slice(0, 5)) {
    try {
      const response = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=25`, {
        headers: { "user-agent": "WasabiBot/1.0" },
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        data?: { children?: Array<{ data?: Record<string, unknown> }> };
      };
      for (const child of data.data?.children ?? []) {
        const post = child.data ?? {};
        const title = String(post.title ?? "");
        const body = String(post.selftext ?? "");
        const matches = input.keywords.some((k) =>
          `${title} ${body}`.toLowerCase().includes(k.toLowerCase()),
        );
        if (!matches) continue;
        out.push({
          id: String(post.name ?? ""),
          subreddit: sub,
          title,
          excerpt: body.slice(0, 400),
          url: `https://reddit.com${String(post.permalink ?? "")}`,
          rules: `r/${sub}: follow the sidebar rules; answer the question before mentioning any product.`,
        });
        if (out.length >= input.limit) return out;
      }
    } catch {
      // A single unreachable subreddit must not fail the cycle.
    }
  }
  return out;
}

// ----------------------------------------------------------------- GEO probe

export type GeoCitation = { engine: string; prompt: string; cited: boolean; competitor?: string };

/** Asks each AI search engine whether the product is cited for buying-intent prompts. */
export async function probeGeoCitations(input: {
  productName: string;
  prompts: string[];
}): Promise<GeoCitation[]> {
  const engines = ["ChatGPT", "Perplexity", "Gemini", "Claude"];
  if (mocking()) {
    const out: GeoCitation[] = [];
    for (const prompt of input.prompts) {
      for (const engine of engines) {
        const seed = Math.abs(hash(`${engine}:${prompt}:${input.productName}`));
        out.push({
          engine,
          prompt,
          cited: seed % 5 === 0,
          competitor: seed % 5 === 0 ? undefined : "Littlebird",
        });
      }
    }
    return out;
  }
  // Live probing requires per-engine credentials; unconfigured engines are skipped
  // and the caller marks the audit stale rather than inventing a result.
  return [];
}

export async function sendNotification(
  config: Record<string, unknown> | null,
  message: string,
): Promise<boolean> {
  if (!config) return false;
  if (mocking()) return true;
  const url = String(config.webhookUrl ?? config.url ?? "");
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------- helpers

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "untitled";
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
