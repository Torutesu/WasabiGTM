import { db } from "@/lib/db";
import { BadRequestError, NotFoundError, projectBySlug, withUser } from "@/lib/api";
import { FoundationDocKind } from "@/generated/prisma/client";

const KINDS = Object.values(FoundationDocKind) as string[];

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/docs/[kind]">,
) {
  const { slug, kind } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { content?: string };

  return withUser(async ({ user }) => {
    if (!KINDS.includes(kind)) throw new BadRequestError(`Unknown document kind: ${kind}`);
    if (typeof body.content !== "string") throw new BadRequestError("content is required");

    const project = await projectBySlug(slug);
    const existing = await db.foundationDoc.findUnique({
      where: { projectId_kind: { projectId: project.id, kind: kind as FoundationDocKind } },
    });
    if (!existing) throw new NotFoundError(`Document ${kind} has not been generated yet`);

    // Snapshot the outgoing version before overwriting, so history is complete.
    await db.foundationDocRevision.create({
      data: {
        docId: existing.id,
        content: existing.content,
        version: existing.version,
        updatedBy: existing.updatedBy,
      },
    });

    const updated = await db.foundationDoc.update({
      where: { id: existing.id },
      data: {
        content: body.content,
        version: existing.version + 1,
        updatedBy: user.id,
      },
    });

    return { doc: updated };
  });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/docs/[kind]">) {
  const { slug, kind } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const doc = await db.foundationDoc.findUnique({
      where: { projectId_kind: { projectId: project.id, kind: kind as FoundationDocKind } },
      include: { history: { orderBy: { version: "desc" } } },
    });
    if (!doc) throw new NotFoundError(`Document ${kind} not found`);
    return { doc };
  });
}
