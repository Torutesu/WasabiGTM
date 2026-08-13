import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runJob, startJob } from "@/lib/jobs";
import { STALE_JOB_MINUTES, planTick, type ProjectSchedule } from "@/lib/scheduler";
import { JobKind, JobStatus, ProjectStatus } from "@/generated/prisma/client";

/**
 * The heartbeat of the autonomous loop.
 *
 * Call it on a schedule (Cloudflare cron trigger, GitHub Actions, crontab —
 * see docs/deploy.md); every call runs at most `limit` due jobs and returns
 * what it did. It is deliberately idempotent: a project with a live job is
 * skipped, so overlapping ticks cannot double-run a cycle.
 */

export const dynamic = "force-dynamic";
// Long enough for one DAILY_CYCLE, which makes several model calls.
export const maxDuration = 300;

export async function POST(request: Request) {
  return tick(request);
}

// GET is accepted because several schedulers can only issue a plain GET.
export async function GET(request: Request) {
  return tick(request);
}

async function tick(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set — the scheduler is disabled" },
      { status: 503 },
    );
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(5, Math.max(1, Number(url.searchParams.get("limit")) || 1));
  const only = url.searchParams.get("project");
  const now = new Date();

  // A job whose process died would otherwise mark its project busy forever.
  const reaped = await db.jobRun.updateMany({
    where: {
      status: JobStatus.RUNNING,
      startedAt: { lt: new Date(now.getTime() - STALE_JOB_MINUTES * 60_000) },
    },
    data: {
      status: JobStatus.FAILED,
      finishedAt: now,
      error: `Abandoned — no progress for ${STALE_JOB_MINUTES} minutes`,
    },
  });

  const projects = await db.project.findMany({
    where: { status: ProjectStatus.ACTIVE, ...(only ? { slug: only } : {}) },
    select: { id: true, slug: true, cycleHours: true },
  });
  if (projects.length === 0) {
    return NextResponse.json({ ran: [], skipped: "no active projects", reaped: reaped.count });
  }

  const projectIds = projects.map((p) => p.id);
  const [running, latest] = await Promise.all([
    db.jobRun.findMany({
      where: { projectId: { in: projectIds }, status: JobStatus.RUNNING },
      select: { projectId: true },
    }),
    db.jobRun.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { startedAt: "desc" },
      distinct: ["projectId", "kind"],
      select: { projectId: true, kind: true, startedAt: true },
    }),
  ]);

  const busy = new Set(running.map((row) => row.projectId));
  const lastByProject = new Map<string, Partial<Record<JobKind, Date>>>();
  for (const row of latest) {
    const entry = lastByProject.get(row.projectId) ?? {};
    entry[row.kind] = row.startedAt;
    lastByProject.set(row.projectId, entry);
  }

  const schedules: ProjectSchedule[] = projects.map((project) => ({
    projectId: project.id,
    slug: project.slug,
    cycleHours: project.cycleHours,
    lastRunAt: lastByProject.get(project.id) ?? {},
    busy: busy.has(project.id),
  }));

  const plan = planTick(schedules, now, limit);
  const ran: Array<{ project: string; kind: JobKind; status: JobStatus; jobId: string }> = [];

  for (const job of plan) {
    // Re-check inside the loop: an earlier job in this same tick may have been
    // for the same project, and a concurrent tick may have claimed it.
    const live = await db.jobRun.count({
      where: { projectId: job.projectId, status: JobStatus.RUNNING },
    });
    if (live > 0) continue;

    const jobId = await startJob(job.projectId, job.kind);
    const result = await runJob(jobId);
    ran.push({ project: job.slug, kind: job.kind, status: result.status, jobId });
  }

  return NextResponse.json({
    ran,
    considered: schedules.length,
    busy: schedules.filter((s) => s.busy).map((s) => s.slug),
    reaped: reaped.count,
    at: now.toISOString(),
  });
}

/** Accepts the secret as a bearer token, or as `?key=` for simpler schedulers. */
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const query = new URL(request.url).searchParams.get("key") ?? "";
  return timingSafeEqual(bearer, secret) || timingSafeEqual(query, secret);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
