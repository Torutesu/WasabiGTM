import { db } from "@/lib/db";
import { llm } from "@/lib/llm";
import { runChannelAgent } from "@/lib/agents";
import { runGeoAudit, runSeoAudit, type Issue } from "@/lib/audit";
import { generateFoundationDocs, ingestSource, loadProjectContext } from "@/lib/context";
import { integrationConfig, pullMetrics, sendNotification } from "@/lib/external";
import {
  Channel,
  ContextSourceKind,
  Difficulty,
  DraftAuthor,
  IntegrationKind,
  JobKind,
  JobStatus,
  Priority,
  ProjectStatus,
} from "@wasabi/prisma/client";

const MAX_ATTEMPTS = 3;

export type JobResult = { jobId: string; status: JobStatus };

/** Appends a line to the job log so the UI can stream progress. */
async function log(jobId: string, line: string): Promise<void> {
  const job = await db.jobRun.findUnique({ where: { id: jobId }, select: { log: true } });
  const next = job?.log ? `${job.log}\n${line}` : line;
  await db.jobRun.update({ where: { id: jobId }, data: { log: next } });
}

export async function startJob(projectId: string, kind: JobKind): Promise<string> {
  const job = await db.jobRun.create({
    data: { projectId, kind, status: JobStatus.RUNNING },
  });
  return job.id;
}

/**
 * Runs a job to completion with up to 3 attempts. Errors are recorded on the
 * job rather than thrown, so a failing cycle never takes the app down.
 */
export async function runJob(jobId: string): Promise<JobResult> {
  const job = await db.jobRun.findUniqueOrThrow({ where: { id: jobId } });

  for (let attempt = job.attempt; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.jobRun.update({ where: { id: jobId }, data: { attempt, status: JobStatus.RUNNING } });
      await execute(job.id, job.projectId, job.kind);
      await db.jobRun.update({
        where: { id: jobId },
        data: { status: JobStatus.SUCCESS, finishedAt: new Date(), error: null },
      });
      return { jobId, status: JobStatus.SUCCESS };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await log(jobId, `attempt ${attempt} failed: ${message}`);
      if (attempt >= MAX_ATTEMPTS) {
        await db.jobRun.update({
          where: { id: jobId },
          data: { status: JobStatus.FAILED, finishedAt: new Date(), error: message },
        });
        return { jobId, status: JobStatus.FAILED };
      }
    }
  }
  return { jobId, status: JobStatus.FAILED };
}

async function execute(jobId: string, projectId: string, kind: JobKind): Promise<void> {
  switch (kind) {
    case JobKind.ONBOARD_ANALYSIS:
      return onboardAnalysis(jobId, projectId);
    case JobKind.DAILY_CYCLE:
      return dailyCycle(jobId, projectId);
    case JobKind.AUDIT:
      return auditJob(jobId, projectId);
    case JobKind.METRIC_PULL:
      return metricPull(jobId, projectId);
    case JobKind.WEEKLY_REVIEW:
      return weeklyReview(jobId, projectId);
    case JobKind.CONTEXT_SYNC:
      return contextSync(jobId, projectId);
  }
}

// ------------------------------------------------------------ ONBOARD (AIF-001/002)

async function onboardAnalysis(jobId: string, projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { contextSources: true },
  });

  await log(jobId, `$ Initializing Wasabi CMO...`);

  const texts: string[] = [];
  for (const source of project.contextSources) {
    const config = (source.config ?? {}) as Record<string, unknown>;
    const label =
      source.kind === ContextSourceKind.WEBSITE
        ? String(config.url ?? project.url)
        : String(config.label ?? source.kind);
    await log(jobId, `> Reading ${label} ...`);
    const result = await ingestSource(source.id);
    if (result.error) {
      await log(jobId, `> Reading ${label} ... failed (${result.error})`);
    } else {
      await log(jobId, `> Reading ${label} ... ok (${result.text.length} chars)`);
      texts.push(result.text);
    }
  }

  const sourceText = texts.join("\n\n---\n\n");
  if (!sourceText.trim()) {
    throw new Error("No context could be read from any source");
  }

  const { failed } = await generateFoundationDocs({
    projectId,
    productName: project.name,
    url: project.url,
    sourceText,
    onProgress: (message) => log(jobId, `> ${message}`),
  });

  if (failed.length === 5) throw new Error("Every foundation document failed to generate");

  await ensureAgentConfigs(projectId, project.phase);
  await db.project.update({ where: { id: projectId }, data: { status: ProjectStatus.ACTIVE } });
  await log(jobId, `✓ Context loaded and CMO initialized`);
}

/** Default per-channel quotas, matching the daily delivery promise in the PRD. */
export async function ensureAgentConfigs(projectId: string, phase: string): Promise<void> {
  const defaults: Array<{ channel: Channel; quota: number; enabled: boolean; config?: object }> = [
    { channel: Channel.X, quota: 1, enabled: true },
    {
      channel: Channel.REDDIT,
      quota: 2,
      enabled: true,
      config: {
        subreddits: ["macapps", "productivity", "SideProject"],
        keywords: ["workflow", "context switching", "note taking"],
      },
    },
    { channel: Channel.SEO_GEO, quota: 2, enabled: true },
    { channel: Channel.ARTICLE, quota: 1, enabled: true },
    { channel: Channel.LAUNCH, quota: 1, enabled: phase !== "growth" },
  ];

  for (const item of defaults) {
    await db.agentConfig.upsert({
      where: { projectId_channel: { projectId, channel: item.channel } },
      update: {},
      create: {
        projectId,
        channel: item.channel,
        dailyQuota: item.quota,
        enabled: item.enabled,
        config: (item.config ?? {}) as never,
      },
    });
  }
}

// ---------------------------------------------------------------- DAILY CYCLE

async function dailyCycle(jobId: string, projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { agentConfigs: true },
  });
  const context = await loadProjectContext(projectId);
  const cycleId = jobId;

  let created = 0;
  let dropped = 0;

  for (const config of project.agentConfigs) {
    if (!config.enabled) continue;

    if (config.channel === Channel.SEO_GEO) {
      const result = await seoGeoCards({
        projectId,
        cycleId,
        quota: config.dailyQuota,
        url: project.url,
        productName: project.name,
      });
      created += result.created;
      await log(jobId, `SEO_GEO: ${result.created} cards`);
      continue;
    }

    try {
      const output = await runChannelAgent({
        projectId,
        cycleId,
        channel: config.channel,
        quota: config.dailyQuota,
        languages: project.languages,
        instructions: config.instructions ?? "",
        channelConfig: (config.config ?? {}) as Record<string, unknown>,
        context,
      });
      created += output.created;
      dropped += output.dropped;
      await log(
        jobId,
        `${config.channel}: ${output.created} cards${output.dropped ? `, ${output.dropped} dropped (quality)` : ""}`,
      );
      for (const note of output.notes) await log(jobId, `  ${note}`);
    } catch (error) {
      // A single channel failing must not fail the whole cycle.
      await log(
        jobId,
        `${config.channel}: skipped (${error instanceof Error ? error.message : "unknown error"})`,
      );
    }
  }

  await log(jobId, `cycle complete — ${created} cards ready${dropped ? `, ${dropped} dropped (quality)` : ""}`);

  const notify = await db.integration.findFirst({
    where: { projectId, kind: { in: [IntegrationKind.SLACK_WEBHOOK, IntegrationKind.TELEGRAM_BOT] }, status: "CONNECTED" },
  });
  if (notify && created > 0) {
    await sendNotification(
      await integrationConfig(projectId, notify.kind),
      `${created} cards ready for ${project.name}: /projects/${project.slug}/feed`,
    );
  }
}

/** Turns the newest audit's top issues into fix cards. */
async function seoGeoCards(input: {
  projectId: string;
  cycleId: string;
  quota: number;
  url: string;
  productName: string;
}): Promise<{ created: number }> {
  const audits = await db.siteAudit.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  let seo = audits.find((a) => a.kind === "SEO") ?? null;
  let geo = audits.find((a) => a.kind === "GEO") ?? null;

  if (!seo) {
    await runSeoAudit({ projectId: input.projectId, url: input.url, productName: input.productName });
    seo = await db.siteAudit.findFirst({
      where: { projectId: input.projectId, kind: "SEO" },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!geo) {
    await runGeoAudit({ projectId: input.projectId, url: input.url, productName: input.productName });
    geo = await db.siteAudit.findFirst({
      where: { projectId: input.projectId, kind: "GEO" },
      orderBy: { createdAt: "desc" },
    });
  }

  const issues: Array<{ issue: Issue; kind: string }> = [
    ...((geo?.issues as unknown as Issue[]) ?? []).map((issue) => ({ issue, kind: "geo_fix" })),
    ...((seo?.issues as unknown as Issue[]) ?? []).map((issue) => ({ issue, kind: "seo_fix" })),
  ];

  let created = 0;
  for (const { issue, kind } of issues) {
    if (created >= input.quota) break;
    const exists = await db.feedCard.findFirst({
      where: { projectId: input.projectId, title: issue.title, status: { in: ["CURRENT", "PUBLISHED", "DONE"] } },
    });
    if (exists) continue;
    await createFixCard({ projectId: input.projectId, cycleId: input.cycleId, issue, type: kind });
    created += 1;
  }
  return { created };
}

export async function createFixCard(input: {
  projectId: string;
  cycleId?: string;
  issue: Issue;
  type: string;
}): Promise<string> {
  const card = await db.feedCard.create({
    data: {
      projectId: input.projectId,
      cycleId: input.cycleId,
      channel: Channel.SEO_GEO,
      type: input.type,
      title: input.issue.title,
      language: "en",
      rationale: `Audit flagged "${input.issue.title}": ${input.issue.detail}`,
      priority:
        input.issue.severity === "HIGH"
          ? Priority.HIGH
          : input.issue.severity === "LOW"
            ? Priority.LOW
            : Priority.MEDIUM,
      difficulty: input.issue.filePath ? Difficulty.MEDIUM : Difficulty.EASY,
      sourceRef: input.issue as never,
    },
  });

  await db.draft.create({
    data: {
      cardId: card.id,
      version: 1,
      content: `${input.issue.detail}\n\n${input.issue.fixSuggestion}`,
      authorType: DraftAuthor.AGENT,
      meta: {
        filePath: input.issue.filePath ?? null,
        fileContent: input.issue.fileContent ?? null,
      } as never,
    },
  });

  return card.id;
}

// --------------------------------------------------------------------- AUDIT

async function auditJob(jobId: string, projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await log(jobId, "Running SEO audit...");
  const seo = await runSeoAudit({ projectId, url: project.url, productName: project.name });
  await log(jobId, `SEO score ${seo.score} (${seo.issues.length} issues)${seo.stale ? " [stale]" : ""}`);

  await log(jobId, "Running GEO audit...");
  const geo = await runGeoAudit({ projectId, url: project.url, productName: project.name });
  await log(jobId, `GEO score ${geo.score} (${geo.issues.length} issues)${geo.stale ? " [stale]" : ""}`);
}

// --------------------------------------------------------------- METRIC PULL

async function metricPull(jobId: string, projectId: string): Promise<void> {
  const [records, gsc, ga, x] = await Promise.all([
    db.publishRecord.findMany({ where: { projectId } }),
    integrationConfig(projectId, IntegrationKind.GSC),
    integrationConfig(projectId, IntegrationKind.GA),
    integrationConfig(projectId, IntegrationKind.X_OAUTH),
  ]);

  const { perRecord, snapshots } = await pullMetrics({
    projectId,
    gsc,
    ga,
    x,
    // cardId is what GA attribution keys on (it is the utm_campaign we stamp);
    // externalUrl is what Search Console and X match on.
    records: records.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      channel: r.channel,
      externalUrl: r.externalUrl,
      publishedAt: r.publishedAt,
    })),
    today: new Date(),
  });

  for (const [recordId, metrics] of perRecord) {
    await db.outcomeMetric.create({ data: { recordId, metrics: metrics as never } });
  }
  for (const snapshot of snapshots) {
    await db.metricSnapshot.upsert({
      where: {
        projectId_source_date: {
          projectId,
          source: snapshot.source,
          date: new Date(snapshot.date),
        },
      },
      update: { metrics: snapshot.metrics as never },
      create: {
        projectId,
        source: snapshot.source,
        date: new Date(snapshot.date),
        metrics: snapshot.metrics as never,
      },
    });
  }

  await log(jobId, `Pulled metrics for ${perRecord.size} published items`);
}

// ------------------------------------------------------------- WEEKLY REVIEW

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    content: { type: "string" },
    learnings: {
      type: "object",
      properties: {
        angles: { type: "array", items: { type: "string" } },
        channels: { type: "array", items: { type: "string" } },
        note: { type: "string" },
      },
      required: ["angles", "channels", "note"],
      additionalProperties: false,
    },
  },
  required: ["content", "learnings"],
  additionalProperties: false,
} as const;

async function weeklyReview(jobId: string, projectId: string): Promise<void> {
  const records = await db.publishRecord.findMany({
    where: { projectId },
    include: { outcomes: { orderBy: { capturedAt: "desc" }, take: 1 }, card: true },
  });

  const byChannel = new Map<
    string,
    { channel: string; published: number; clicks: number; topAngle?: string; topClicks: number }
  >();

  for (const record of records) {
    const metrics = (record.outcomes[0]?.metrics ?? {}) as Record<string, number>;
    const clicks = Number(metrics.clicks ?? 0);
    const entry = byChannel.get(record.channel) ?? {
      channel: record.channel,
      published: 0,
      clicks: 0,
      topClicks: 0,
    };
    entry.published += 1;
    entry.clicks += clicks;
    if (clicks > entry.topClicks) {
      entry.topClicks = clicks;
      const rationale = record.card.rationale ?? "";
      const angle = rationale.match(/"([^"]+)"/)?.[1];
      if (angle) entry.topAngle = angle;
    }
    byChannel.set(record.channel, entry);
  }

  const stats = Array.from(byChannel.values());

  const review = await llm().generate<{
    content: string;
    learnings: { angles: string[]; channels: string[]; note: string };
  }>({
    tier: "high",
    system:
      "You analyse a week of published growth work and decide what to do differently. " +
      "If there is not enough data to draw a conclusion, say so plainly instead of inventing one.",
    prompt: `Per-channel results this week:\n${JSON.stringify(stats, null, 2)}`,
    schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
    offlineKey: "weekly-review",
    offlineContext: { stats: JSON.stringify(stats) },
  });

  const weekStart = startOfWeek(new Date());
  await db.weeklyReview.upsert({
    where: { projectId_weekStart: { projectId, weekStart } },
    update: { content: review.content, learnings: review.learnings as never },
    create: {
      projectId,
      weekStart,
      content: review.content,
      learnings: review.learnings as never,
    },
  });

  await log(jobId, `Weekly review written (${stats.length} channels analysed)`);
}

export function startOfWeek(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - ((day + 6) % 7));
  return copy;
}

// -------------------------------------------------------------- CONTEXT SYNC

const DIFF_SCHEMA = {
  type: "object",
  properties: {
    changed: { type: "boolean" },
    summary: { type: "string" },
    proposedContent: { type: "string" },
  },
  required: ["changed", "summary", "proposedContent"],
  additionalProperties: false,
} as const;

async function contextSync(jobId: string, projectId: string): Promise<void> {
  const sources = await db.contextSource.findMany({
    where: { projectId, enabled: true },
    include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  for (const source of sources) {
    const before = source.snapshots[0]?.content ?? "";
    const result = await ingestSource(source.id);
    if (result.error) {
      await log(jobId, `${source.kind}: sync failed (${result.error})`);
      continue;
    }
    if (before.trim() === result.text.trim()) {
      await log(jobId, `${source.kind}: no change`);
      continue;
    }

    const diff = await llm().generate<{
      changed: boolean;
      summary: string;
      proposedContent: string;
    }>({
      tier: "light",
      system:
        "You detect whether a change to a product's public surface is meaningful enough to update " +
        "its strategy documents. Cosmetic edits are not meaningful.",
      prompt: `Previous:\n${before.slice(0, 6000)}\n\nCurrent:\n${result.text.slice(0, 6000)}`,
      schema: DIFF_SCHEMA as unknown as Record<string, unknown>,
      offlineKey: "context-diff",
      offlineContext: { before, after: result.text },
    });

    if (diff.changed) {
      // Proposal only — a human accepts or rejects it. We never silently
      // overwrite a document a human has edited.
      await db.contextSource.update({
        where: { id: source.id },
        data: {
          suggestion: {
            summary: diff.summary,
            proposedContent: diff.proposedContent,
            createdAt: new Date().toISOString(),
          } as never,
        },
      });
      await log(jobId, `${source.kind}: update suggested — ${diff.summary}`);
    } else {
      await log(jobId, `${source.kind}: changed but not meaningful`);
    }
  }
}
