import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/docs">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const [docs, sources] = await Promise.all([
      db.foundationDoc.findMany({ where: { projectId: project.id } }),
      db.contextSource.findMany({
        where: { projectId: project.id },
        orderBy: { kind: "asc" },
      }),
    ]);
    return { docs, sources };
  });
}
