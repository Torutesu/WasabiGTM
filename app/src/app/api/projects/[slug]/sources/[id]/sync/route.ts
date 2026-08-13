import { db } from "@/lib/db";
import { NotFoundError, projectBySlug, withUser } from "@/lib/api";
import { ingestSource } from "@/lib/context";

/** Re-reads a single context source, so the per-source Sync button means what it says. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/sources/[id]/sync">,
) {
  const { slug, id } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const source = await db.contextSource.findFirst({
      where: { id, projectId: project.id },
    });
    if (!source) throw new NotFoundError("Context source not found");

    const result = await ingestSource(source.id);
    return { sourceId: source.id, error: result.error ?? null };
  });
}
