import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dueJobFor, intervalHours, planTick, type ProjectSchedule } from "./scheduler";

/**
 * The scheduler decides what the product does unattended, so its policy is
 * tested directly rather than through the loop it drives.
 */

const NOW = new Date("2026-03-10T12:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function schedule(overrides: Partial<ProjectSchedule> = {}): ProjectSchedule {
  return {
    projectId: "p1",
    slug: "shogun",
    cycleHours: 6,
    // Everything just ran, so nothing is due unless a test says so.
    lastRunAt: {
      AUDIT: hoursAgo(1),
      METRIC_PULL: hoursAgo(1),
      WEEKLY_REVIEW: hoursAgo(1),
      DAILY_CYCLE: hoursAgo(1),
    },
    busy: false,
    ...overrides,
  };
}

afterEach(() => {
  for (const key of ["CRON_AUDIT_HOURS", "CRON_METRIC_HOURS", "CRON_REVIEW_HOURS"]) {
    delete process.env[key];
  }
});

describe("intervalHours", () => {
  it("follows the project's cycleHours for the daily cycle", () => {
    assert.equal(intervalHours("DAILY_CYCLE", 3), 3);
    assert.equal(intervalHours("DAILY_CYCLE", 0), 6);
  });

  it("is overridable by environment", () => {
    process.env.CRON_AUDIT_HOURS = "2";
    assert.equal(intervalHours("AUDIT", 6), 2);
  });

  it("ignores a nonsense override", () => {
    process.env.CRON_METRIC_HOURS = "not-a-number";
    assert.equal(intervalHours("METRIC_PULL", 6), 6);
  });

  it("leaves user-triggered kinds unscheduled", () => {
    assert.equal(intervalHours("ONBOARD_ANALYSIS", 6), null);
    assert.equal(intervalHours("CONTEXT_SYNC", 6), null);
  });
});

describe("dueJobFor", () => {
  it("returns nothing when everything ran recently", () => {
    assert.equal(dueJobFor(schedule(), NOW), null);
  });

  it("never starts a second job while one is live", () => {
    assert.equal(dueJobFor(schedule({ busy: true, lastRunAt: {} }), NOW), null);
  });

  it("treats a kind that has never run as due", () => {
    const job = dueJobFor(schedule({ lastRunAt: {} }), NOW);
    assert.equal(job?.kind, "AUDIT");
  });

  it("refreshes inputs before running the cycle that consumes them", () => {
    // Both the audit and the cycle are overdue; the audit wins so the cycle
    // picks up the fix cards it produces on a later tick.
    const job = dueJobFor(
      schedule({ lastRunAt: { AUDIT: hoursAgo(30), DAILY_CYCLE: hoursAgo(30) } }),
      NOW,
    );
    assert.equal(job?.kind, "AUDIT");
  });

  it("runs the daily cycle once its own interval has passed", () => {
    const job = dueJobFor(
      schedule({ cycleHours: 6, lastRunAt: { ...schedule().lastRunAt, DAILY_CYCLE: hoursAgo(7) } }),
      NOW,
    );
    assert.equal(job?.kind, "DAILY_CYCLE");
    assert.ok(job && job.overdueHours > 0.9 && job.overdueHours < 1.1);
  });

  it("holds the cycle back until cycleHours has elapsed", () => {
    const job = dueJobFor(
      schedule({ cycleHours: 12, lastRunAt: { ...schedule().lastRunAt, DAILY_CYCLE: hoursAgo(7) } }),
      NOW,
    );
    assert.equal(job, null);
  });
});

describe("planTick", () => {
  it("runs at most one job per tick by default", () => {
    const plan = planTick(
      [
        schedule({ projectId: "a", slug: "a", lastRunAt: {} }),
        schedule({ projectId: "b", slug: "b", lastRunAt: {} }),
      ],
      NOW,
    );
    assert.equal(plan.length, 1);
  });

  it("serves the most overdue project first", () => {
    const plan = planTick(
      [
        schedule({
          projectId: "a",
          slug: "a",
          lastRunAt: { ...schedule().lastRunAt, DAILY_CYCLE: hoursAgo(8) },
        }),
        schedule({
          projectId: "b",
          slug: "b",
          lastRunAt: { ...schedule().lastRunAt, DAILY_CYCLE: hoursAgo(40) },
        }),
      ],
      NOW,
    );
    assert.deepEqual(
      plan.map((job) => job.slug),
      ["b"],
    );
  });

  it("gives each project at most one slot when the limit is raised", () => {
    const plan = planTick(
      [
        schedule({ projectId: "a", slug: "a", lastRunAt: {} }),
        schedule({ projectId: "b", slug: "b", lastRunAt: {} }),
      ],
      NOW,
      5,
    );
    assert.equal(plan.length, 2);
    assert.equal(new Set(plan.map((job) => job.projectId)).size, 2);
  });

  it("skips busy projects entirely", () => {
    const plan = planTick(
      [
        schedule({ projectId: "a", slug: "a", lastRunAt: {}, busy: true }),
        schedule({ projectId: "b", slug: "b", lastRunAt: {} }),
      ],
      NOW,
      5,
    );
    assert.deepEqual(
      plan.map((job) => job.slug),
      ["b"],
    );
  });
});
