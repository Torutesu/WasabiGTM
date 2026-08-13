import { db } from "@/lib/db";
import { projectBySlug, withUser } from "@/lib/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/agents">) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const agents = await db.agentConfig.findMany({
      where: { projectId: project.id },
      orderBy: { channel: "asc" },
    });
    return { agents };
  });
}
