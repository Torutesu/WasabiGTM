import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { ContextSourceKind } from "@wasabi/prisma/client";

const KINDS = Object.values(ContextSourceKind) as string[];

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/sources">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const sources = await db.contextSource.findMany({ where: { projectId: project.id } });
    return { sources };
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/sources">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    config?: Record<string, unknown>;
  };

  return withUser(async () => {
    if (!body.kind || !KINDS.includes(body.kind)) {
      throw new BadRequestError(`Unknown source kind: ${body.kind}`);
    }
    const project = await projectBySlug(slug);
    const source = await db.contextSource.create({
      data: {
        projectId: project.id,
        kind: body.kind as ContextSourceKind,
        config: (body.config ?? {}) as never,
      },
    });
    return { source };
  });
}
