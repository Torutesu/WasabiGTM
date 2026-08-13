import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/reviews">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const reviews = await db.weeklyReview.findMany({
      where: { projectId: project.id },
      orderBy: { weekStart: "desc" },
    });
    return { reviews };
  });
}
