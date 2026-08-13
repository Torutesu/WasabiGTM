import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { IntegrationKind } from "@wasabi/prisma/client";

const KINDS = Object.values(IntegrationKind) as string[];

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/integrations/[kind]">,
) {
  const { slug, kind } = await ctx.params;
  return withUser(async () => {
    if (!KINDS.includes(kind)) throw new BadRequestError(`Unknown integration kind: ${kind}`);
    const project = await projectBySlug(slug);
    await db.integration.deleteMany({
      where: { projectId: project.id, kind: kind as IntegrationKind },
    });
    return { ok: true };
  });
}
