import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { Channel } from "@wasabi/prisma/client";

const CHANNELS = Object.values(Channel) as string[];

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/agents/[channel]">,
) {
  const { slug, channel } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    dailyQuota?: number;
    instructions?: string;
    config?: Record<string, unknown>;
  };

  return withUser(async () => {
    if (!CHANNELS.includes(channel)) throw new BadRequestError(`Unknown channel: ${channel}`);
    const project = await projectBySlug(slug);

    const agent = await db.agentConfig.upsert({
      where: { projectId_channel: { projectId: project.id, channel: channel as Channel } },
      update: {
        enabled: body.enabled,
        dailyQuota: body.dailyQuota,
        instructions: body.instructions,
        config: body.config as never,
      },
      create: {
        projectId: project.id,
        channel: channel as Channel,
        enabled: body.enabled ?? true,
        dailyQuota: body.dailyQuota ?? 1,
        instructions: body.instructions ?? null,
        config: (body.config ?? {}) as never,
      },
    });

    return { agent };
  });
}
