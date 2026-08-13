// Type-only so this module stays free of runtime imports and can be unit-tested
// without pulling in the generated Prisma client.
import type { JobKind } from "@wasabi/prisma/client";

/**
 * Decides what the autonomous loop should run next.
 *
 * The policy lives here, apart from the database, so it can be reasoned about
 * and unit-tested: given when each job kind last ran, which one is due now?
 */

/** A RUNNING job older than this is assumed dead and is reaped. */
export const STALE_JOB_MINUTES = 30;

/**
 * Checked in order, so when several kinds are due the inputs are refreshed
 * before the cycle that consumes them: audits produce fix cards, metrics feed
 * the weekly review, and the review's learnings steer the next daily cycle.
 */
const ORDER: JobKind[] = ["AUDIT", "METRIC_PULL", "WEEKLY_REVIEW", "DAILY_CYCLE"];

function envHours(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** How often each kind should run. DAILY_CYCLE follows the project's setting. */
export function intervalHours(kind: JobKind, cycleHours: number): number | null {
  switch (kind) {
    case "DAILY_CYCLE":
      return cycleHours > 0 ? cycleHours : 6;
    case "AUDIT":
      return envHours("CRON_AUDIT_HOURS", 24);
    case "METRIC_PULL":
      return envHours("CRON_METRIC_HOURS", 6);
    case "WEEKLY_REVIEW":
      return envHours("CRON_REVIEW_HOURS", 168);
    default:
      // ONBOARD_ANALYSIS and CONTEXT_SYNC are triggered by the user, not the clock.
      return null;
  }
}

export type ProjectSchedule = {
  projectId: string;
  slug: string;
  cycleHours: number;
  /** Last start time per kind, whatever the outcome. Missing means never run. */
  lastRunAt: Partial<Record<JobKind, Date>>;
  /** A live job for this project; a second one must not be started. */
  busy: boolean;
};

export type DueJob = {
  projectId: string;
  slug: string;
  kind: JobKind;
  /** Hours past the point it should have run — used to break ties. */
  overdueHours: number;
};

/** The single job this project should run now, or null. */
export function dueJobFor(schedule: ProjectSchedule, now: Date): DueJob | null {
  if (schedule.busy) return null;

  for (const kind of ORDER) {
    const interval = intervalHours(kind, schedule.cycleHours);
    if (interval === null) continue;

    const last = schedule.lastRunAt[kind];
    // A kind that has never run is due immediately — that is what starts the
    // loop for a project that has just finished onboarding.
    const elapsedHours = last
      ? (now.getTime() - last.getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY;

    if (elapsedHours >= interval) {
      return {
        projectId: schedule.projectId,
        slug: schedule.slug,
        kind,
        overdueHours: Number.isFinite(elapsedHours) ? elapsedHours - interval : Number.MAX_SAFE_INTEGER,
      };
    }
  }
  return null;
}

/**
 * Picks the work for one tick across every project.
 *
 * Each tick runs a bounded number of jobs, and at most one per project, so a
 * single busy project cannot starve the others and one tick cannot blow past a
 * host's request time limit.
 */
export function planTick(schedules: ProjectSchedule[], now: Date, limit = 1): DueJob[] {
  const due = schedules
    .map((schedule) => dueJobFor(schedule, now))
    .filter((job): job is DueJob => job !== null)
    // Most overdue first, so a project that has been waiting longest catches up.
    .sort((a, b) => b.overdueHours - a.overdueHours);

  return due.slice(0, Math.max(1, limit));
}
