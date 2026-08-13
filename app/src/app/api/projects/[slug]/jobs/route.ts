import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { runJob, startJob } from "@/lib/jobs";
import { JobKind } from "@wasabi/prisma/client";

const RUNNABLE: JobKind[] = [
  JobKind.DAILY_CYCLE,
  JobKind.AUDIT,
  JobKind.METRIC_PULL,
  JobKind.WEEKLY_REVIEW,
  JobKind.CONTEXT_SYNC,
  JobKind.ONBOARD_ANALYSIS,
];

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/jobs">) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const limit = Number(url.searchParams.get("limit") ?? 20);

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const jobs = await db.jobRun.findMany({
      where: { projectId: project.id, kind: kind ? (kind as JobKind) : undefined },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 100),
    });
    return { jobs };
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/jobs">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { kind?: string; retryOf?: string };

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const kind = body.kind as JobKind;
    if (!RUNNABLE.includes(kind)) throw new BadRequestError(`Unknown job kind: ${body.kind}`);

    if (body.retryOf) {
      const result = await runJob(body.retryOf);
      return { jobId: body.retryOf, status: result.status };
    }

    const jobId = await startJob(project.id, kind);
    // Awaited so callers (and the UI's Run now button) see a settled status.
    const result = await runJob(jobId);
    return { jobId, status: result.status };
  });
}
