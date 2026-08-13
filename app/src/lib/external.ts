import {
  OAuthExpiredError,
  freshAccessToken,
  loadConfig,
  saveConfig,
  toTokenSet,
} from "@/lib/oauth";
import { mintInstallationToken } from "@/lib/github-app";
import { IntegrationKind, IntegrationStatus } from "@wasabi/prisma/client";

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

/** Turns an OAuth failure into the shape the publish route already handles. */
function asIntegrationError(error: unknown, label: string): IntegrationError {
  if (error instanceof IntegrationError) return error;
  if (error instanceof OAuthExpiredError) {
    return new IntegrationError(`${label} token expired — reconnect`, "TOKEN_EXPIRED");
  }
  return new IntegrationError(
    `${label} request failed: ${error instanceof Error ? error.message : String(error)}`,
    "REQUEST_FAILED",
  );
}

// ------------------------------------------------------------------- fetch

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

async function refreshXToken(refreshToken: string) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) throw new OAuthExpiredError("X_CLIENT_ID is not set");

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new OAuthExpiredError(
      `X refresh failed (${response.status}): ${String(payload.error_description ?? payload.error ?? "")}`,
    );
  }
  return toTokenSet(payload);
}

export async function postToX(input: {
  projectId: string;
  config: Record<string, unknown> | null;
  body: string;
}): Promise<PostResult> {
  const { projectId, config, body } = input;
  if (!config) throw new IntegrationError("X is not connected", "NOT_CONNECTED");
  if (config.expired === true) {
    throw new IntegrationError("X token expired — reconnect to post", "TOKEN_EXPIRED");
  }

  if (mocking()) {
    const id = Math.abs(hash(body)).toString().padStart(12, "0").slice(0, 12);
    return { url: `https://x.com/${String(config.handle ?? "founder")}/status/${id}` };
  }

  try {
    const token = await freshAccessToken({
      projectId,
      kind: IntegrationKind.X_OAUTH,
      config,
      refresh: refreshXToken,
    });

    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
    if (response.status === 401) {
      throw new IntegrationError("X token expired — reconnect to post", "TOKEN_EXPIRED");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new IntegrationError(
        `X rejected the post (${response.status}): ${detail.slice(0, 300)}`,
        "REQUEST_FAILED",
      );
    }
    const data = (await response.json()) as { data?: { id?: string } };
    const handle = String(config.handle ?? "i");
    return { url: `https://x.com/${handle}/status/${data.data?.id ?? "unknown"}` };
  } catch (error) {
    throw asIntegrationError(error, "X");
  }
}

// ------------------------------------------------------------------ GitHub

/**
 * Opens a pull request that actually contains the change.
 *
 * A PR needs a branch that already holds a commit, so this walks the full
 * sequence: read the base branch head, create a branch from it, write the file,
 * then open the PR. Creating the PR alone — against a branch that does not
 * exist — is what a naive implementation gets wrong.
 */
export async function openPullRequest(input: {
  projectId: string;
  config: Record<string, unknown> | null;
  title: string;
  body: string;
  path: string;
  content: string;
}): Promise<PrResult> {
  const { config } = input;
  if (!config) throw new IntegrationError("GitHub is not connected", "NOT_CONNECTED");
  if (config.expired === true) {
    throw new IntegrationError("GitHub token expired — reconnect", "TOKEN_EXPIRED");
  }

  const repo = String(config.repo ?? "");
  if (mocking()) {
    const number = (Math.abs(hash(input.title)) % 900) + 100;
    return { url: `https://github.com/${repo || "owner/repo"}/pull/${number}`, merged: false };
  }

  if (!repo.includes("/")) {
    throw new IntegrationError(
      `GitHub repo must be "owner/name", got "${repo}"`,
      "REQUEST_FAILED",
    );
  }

  let token: string;
  try {
    token = await githubToken(input.projectId, config);
  } catch (error) {
    throw asIntegrationError(error, "GitHub");
  }

  const api = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "WasabiBot/1.0",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 401) {
      throw new IntegrationError("GitHub token expired — reconnect", "TOKEN_EXPIRED");
    }
    return response;
  };

  try {
    // 1. Base branch and its head commit.
    const repoResponse = await api(`/repos/${repo}`);
    if (!repoResponse.ok) {
      throw new IntegrationError(
        `GitHub could not read ${repo} (${repoResponse.status})`,
        "REQUEST_FAILED",
      );
    }
    const repoData = (await repoResponse.json()) as { default_branch?: string };
    const base = String(config.baseBranch ?? repoData.default_branch ?? "main");

    const refResponse = await api(`/repos/${repo}/git/ref/heads/${base}`);
    if (!refResponse.ok) {
      throw new IntegrationError(
        `GitHub could not read branch ${base} (${refResponse.status})`,
        "REQUEST_FAILED",
      );
    }
    const refData = (await refResponse.json()) as { object?: { sha?: string } };
    const baseSha = refData.object?.sha;
    if (!baseSha) throw new IntegrationError("GitHub returned no base SHA", "REQUEST_FAILED");

    // 2. A fresh branch. The suffix keeps repeated fixes from colliding.
    const branch = `wasabi/${slugify(input.title)}-${Date.now().toString(36)}`;
    const branchResponse = await api(`/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (!branchResponse.ok) {
      const detail = await branchResponse.text().catch(() => "");
      throw new IntegrationError(
        `GitHub could not create branch (${branchResponse.status}): ${detail.slice(0, 200)}`,
        "REQUEST_FAILED",
      );
    }

    // 3. The change itself. An existing file needs its blob SHA to update.
    let existingSha: string | undefined;
    const existing = await api(
      `/repos/${repo}/contents/${encodeURI(input.path)}?ref=${encodeURIComponent(branch)}`,
    );
    if (existing.ok) {
      const data = (await existing.json()) as { sha?: string };
      existingSha = data.sha;
    }

    const commitResponse = await api(`/repos/${repo}/contents/${encodeURI(input.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: input.title,
        content: toBase64(input.content),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
    if (!commitResponse.ok) {
      const detail = await commitResponse.text().catch(() => "");
      throw new IntegrationError(
        `GitHub could not commit ${input.path} (${commitResponse.status}): ${detail.slice(0, 200)}`,
        "REQUEST_FAILED",
      );
    }

    // 4. The pull request. Never merged here — a human does that.
    const prResponse = await api(`/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body, head: branch, base }),
    });
    if (!prResponse.ok) {
      const detail = await prResponse.text().catch(() => "");
      throw new IntegrationError(
        `GitHub rejected the PR (${prResponse.status}): ${detail.slice(0, 200)}`,
        "REQUEST_FAILED",
      );
    }
    const prData = (await prResponse.json()) as { html_url?: string };
    return {
      url: prData.html_url ?? `https://github.com/${repo}/pulls`,
      merged: false,
    };
  } catch (error) {
    throw asIntegrationError(error, "GitHub");
  }
}

/**
 * Resolves the credential the GitHub calls run under.
 *
 * A pasted fine-grained token is used as-is. A GitHub App installation gets a
 * fresh installation token, cached in the integration config until it is close
 * to expiry — they only last an hour.
 */
async function githubToken(
  projectId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const pat = String(config.githubToken ?? "");
  if (pat) return pat;

  const installationId = String(config.installationId ?? "");
  if (!installationId) {
    throw new IntegrationError("GitHub credential is missing — reconnect", "NOT_CONNECTED");
  }

  const cached = String(config.installationToken ?? "");
  const expiresAt = Number(config.installationExpiresAt ?? 0);
  if (cached && expiresAt - Date.now() > 120_000) return cached;

  const minted = await mintInstallationToken(installationId);
  await saveConfig({
    projectId,
    kind: IntegrationKind.GITHUB_APP,
    status: IntegrationStatus.CONNECTED,
    merge: true,
    config: { installationToken: minted.token, installationExpiresAt: minted.expiresAt },
  });
  return minted.token;
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

async function refreshGoogleToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new OAuthExpiredError("Google OAuth is not configured");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new OAuthExpiredError(
      `Google refresh failed (${response.status}): ${String(payload.error_description ?? payload.error ?? "")}`,
    );
  }
  return toTokenSet(payload);
}

/**
 * Pulls per-item metrics for published work.
 *
 * Attribution is by UTM: every publish stamps `utm_campaign=<cardId>`, so GA is
 * queried by campaign and the result maps straight back to the card. Search
 * Console has no campaign dimension, so it contributes site-level totals and
 * per-page clicks, which are matched to article URLs.
 */
export async function pullMetrics(input: {
  projectId: string;
  gsc: Record<string, unknown> | null;
  ga: Record<string, unknown> | null;
  x: Record<string, unknown> | null;
  records: Array<{
    id: string;
    cardId: string;
    channel: string;
    externalUrl: string | null;
    publishedAt: Date;
  }>;
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

  const since = new Date(input.today.getTime() - 27 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const bump = (recordId: string, patch: Record<string, number>) => {
    const current = perRecord.get(recordId) ?? {};
    for (const [key, value] of Object.entries(patch)) {
      current[key] = (current[key] ?? 0) + value;
    }
    perRecord.set(recordId, current);
  };

  // ---- Google Analytics: per-card via the UTM campaign we stamped ----------
  if (input.ga) {
    try {
      const token = await freshAccessToken({
        projectId: input.projectId,
        kind: IntegrationKind.GA,
        config: input.ga,
        refresh: refreshGoogleToken,
      });
      const propertyId = String(input.ga.propertyId ?? "");
      if (propertyId) {
        const response = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: since, endDate: day }],
              dimensions: [{ name: "sessionCampaignName" }],
              metrics: [
                { name: "sessions" },
                { name: "totalUsers" },
                { name: "keyEvents" },
              ],
              limit: 500,
            }),
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            rows?: Array<{
              dimensionValues?: Array<{ value?: string }>;
              metricValues?: Array<{ value?: string }>;
            }>;
          };
          let sessions = 0;
          let users = 0;
          const byCard = new Map(input.records.map((r) => [r.cardId, r.id]));

          for (const row of data.rows ?? []) {
            const campaign = row.dimensionValues?.[0]?.value ?? "";
            const rowSessions = Number(row.metricValues?.[0]?.value ?? 0);
            const rowUsers = Number(row.metricValues?.[1]?.value ?? 0);
            const rowConversions = Number(row.metricValues?.[2]?.value ?? 0);
            sessions += rowSessions;
            users += rowUsers;

            const recordId = byCard.get(campaign);
            if (recordId) {
              bump(recordId, { clicks: rowSessions, signups: rowConversions });
            }
          }
          snapshots.push({ source: "ga", date: day, metrics: { sessions, users } });
        }
      }
    } catch {
      // A failing source must not abort the whole pull; the others still count.
    }
  }

  // ---- Search Console: site totals plus per-page clicks --------------------
  if (input.gsc) {
    try {
      const token = await freshAccessToken({
        projectId: input.projectId,
        kind: IntegrationKind.GSC,
        config: input.gsc,
        refresh: refreshGoogleToken,
      });
      const siteUrl = String(input.gsc.siteUrl ?? "");
      if (siteUrl) {
        const response = await fetch(
          `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
              startDate: since,
              endDate: day,
              dimensions: ["page"],
              rowLimit: 500,
            }),
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number }>;
          };
          let clicks = 0;
          let impressions = 0;

          for (const row of data.rows ?? []) {
            clicks += row.clicks ?? 0;
            impressions += row.impressions ?? 0;

            const page = row.keys?.[0] ?? "";
            const match = input.records.find(
              (record) => record.externalUrl && sameUrl(record.externalUrl, page),
            );
            if (match) {
              bump(match.id, {
                impressions: Math.round(row.impressions ?? 0),
                clicks: Math.round(row.clicks ?? 0),
              });
            }
          }
          snapshots.push({ source: "gsc", date: day, metrics: { clicks, impressions } });
        }
      }
    } catch {
      // Same reasoning as above.
    }
  }

  // ---- X: per-tweet public metrics ----------------------------------------
  if (input.x) {
    try {
      const token = await freshAccessToken({
        projectId: input.projectId,
        kind: IntegrationKind.X_OAUTH,
        config: input.x,
        refresh: refreshXToken,
      });
      const tweets = input.records
        .filter((r) => r.channel === "X" && r.externalUrl)
        .map((r) => ({ id: tweetId(r.externalUrl!), recordId: r.id }))
        .filter((t) => t.id);

      for (const batch of chunk(tweets, 100)) {
        const ids = batch.map((t) => t.id).join(",");
        const response = await fetch(
          `https://api.x.com/2/tweets?ids=${ids}&tweet.fields=public_metrics`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (!response.ok) break;
        const data = (await response.json()) as {
          data?: Array<{
            id?: string;
            public_metrics?: { impression_count?: number; like_count?: number };
          }>;
        };
        let impressions = 0;
        for (const tweet of data.data ?? []) {
          const found = batch.find((t) => t.id === tweet.id);
          const count = tweet.public_metrics?.impression_count ?? 0;
          impressions += count;
          if (found) bump(found.recordId, { impressions: count });
        }
        snapshots.push({ source: "x", date: day, metrics: { impressions } });
      }
    } catch {
      // Same reasoning as above.
    }
  }

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

/**
 * Asks each configured AI search engine whether the product is cited for
 * buying-intent prompts. Engines without a key are skipped rather than guessed,
 * and the caller marks the audit stale when nothing could be probed.
 */
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

  const out: GeoCitation[] = [];
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  // Perplexity is the one engine with a search-grounded API that returns the
  // citations it used, which is exactly what this measures.
  if (perplexityKey) {
    for (const prompt of input.prompts) {
      try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${perplexityKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.PERPLEXITY_MODEL || "sonar",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!response.ok) continue;
        const data = (await response.json()) as {
          citations?: string[];
          choices?: Array<{ message?: { content?: string } }>;
        };
        const answer = data.choices?.[0]?.message?.content ?? "";
        const citations = (data.citations ?? []).join(" ");
        const needle = input.productName.toLowerCase();
        out.push({
          engine: "Perplexity",
          prompt,
          cited:
            answer.toLowerCase().includes(needle) || citations.toLowerCase().includes(needle),
        });
      } catch {
        // Skip this prompt; the audit reports on what it could measure.
      }
    }
  }

  return out;
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

/** Reads an integration's decrypted config, or null when it is unusable. */
export async function integrationConfig(
  projectId: string,
  kind: IntegrationKind,
  options: { allowError?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const { db } = await import("@/lib/db");
  const row = await db.integration.findUnique({
    where: { projectId_kind: { projectId, kind } },
  });
  if (!row || row.status === "DISCONNECTED") return null;
  if (row.status === "ERROR" && !options.allowError) return null;

  const config = await loadConfig(projectId, kind);
  if (!config) return null;
  return { ...config, expired: row.status === "ERROR" };
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
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "untitled"
  );
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Compares URLs ignoring the query string, so UTMs don't break the match. */
function sameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.host === right.host && left.pathname.replace(/\/$/, "") === right.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function tweetId(url: string): string {
  return url.match(/status\/(\d+)/)?.[1] ?? "";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
