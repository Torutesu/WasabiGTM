import { after } from "next/server";
import { db } from "@/lib/db";
import { BadRequestError, withUser } from "@/lib/api";
import { runJob, startJob } from "@/lib/jobs";
import { slugify } from "@/lib/external";
import { ContextSourceKind, JobKind, ProjectStatus } from "@wasabi/prisma/client";

export async function GET() {
  return withUser(async () => {
    const projects = await db.project.findMany({ orderBy: { createdAt: "desc" } });
    return { projects };
  });
}

type CreateBody = {
  url?: string;
  name?: string;
  phase?: string;
  languages?: string[];
  sources?: Array<{ kind: string; config: Record<string, unknown> }>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateBody;

  return withUser(async () => {
    if (!body.url) throw new BadRequestError("A product URL is required");
    if (!body.name) throw new BadRequestError("A product name is required");
    const languages = body.languages?.length ? body.languages : ["en"];

    let slug = slugify(body.name);
    let suffix = 1;
    while (await db.project.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${slugify(body.name)}-${suffix}`;
    }

    const project = await db.project.create({
      data: {
        slug,
        name: body.name,
        url: body.url,
        phase: body.phase ?? "prelaunch",
        languages,
        status: ProjectStatus.ANALYZING,
        contextSources: {
          create: [
            { kind: ContextSourceKind.WEBSITE, config: { url: body.url } as never },
            ...(body.sources ?? []).map((source) => ({
              kind: source.kind as ContextSourceKind,
              config: source.config as never,
            })),
          ],
        },
      },
    });

    const jobId = await startJob(project.id, JobKind.ONBOARD_ANALYSIS);
    // Kick off in the background; the analysis screen streams the job log.
    // `after` rather than a bare `void`: on a serverless host the request's
    // execution context is torn down once the response is sent, and detached
    // work is killed with it. `after` hands the promise to the platform's
    // waitUntil so the analysis survives to completion.
    after(() => runJob(jobId));

    return { project, jobId };
  });
}
