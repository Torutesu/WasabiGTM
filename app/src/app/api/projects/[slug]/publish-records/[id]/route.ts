import { db } from "@/lib/db";
import { NotFoundError, projectBySlug, withUser } from "@/lib/api";

/** Lets a manual publish get its URL attached after the fact, so it can be measured. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/publish-records/[id]">,
) {
  const { slug, id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { externalUrl?: string };

  return withUser(async () => {
    const project = await projectBySlug(slug);
    const record = await db.publishRecord.findFirst({ where: { id, projectId: project.id } });
    if (!record) throw new NotFoundError("Publish record not found");

    const updated = await db.publishRecord.update({
      where: { id },
      data: { externalUrl: body.externalUrl ?? null },
    });
    return { record: updated };
  });
}
