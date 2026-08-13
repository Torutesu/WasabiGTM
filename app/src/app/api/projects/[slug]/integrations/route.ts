import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { IntegrationKind, IntegrationStatus } from "@/generated/prisma/client";

const KINDS = Object.values(IntegrationKind) as string[];

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/integrations">,
) {
  const { slug } = await ctx.params;
  return withUser(async () => {
    const project = await projectBySlug(slug);
    const rows = await db.integration.findMany({ where: { projectId: project.id } });
    // Secrets never leave the server.
    const integrations = rows.map((row) => ({
      kind: row.kind,
      status: row.status,
      label: row.label,
      updatedAt: row.updatedAt,
    }));
    return { integrations };
  });
}

type UpsertBody = {
  kind?: string;
  status?: string;
  label?: string;
  config?: Record<string, unknown>;
};

export async function PUT(request: Request, ctx: RouteContext<"/api/projects/[slug]/integrations">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as UpsertBody;

  return withUser(async () => {
    if (!body.kind || !KINDS.includes(body.kind)) {
      throw new BadRequestError(`Unknown integration kind: ${body.kind}`);
    }
    const project = await projectBySlug(slug);
    const kind = body.kind as IntegrationKind;
    const status = (body.status as IntegrationStatus) ?? IntegrationStatus.CONNECTED;

    const existing = await db.integration.findUnique({
      where: { projectId_kind: { projectId: project.id, kind } },
    });
    const mergedConfig = {
      ...((existing?.config ?? {}) as Record<string, unknown>),
      ...(body.config ?? {}),
    };

    const integration = await db.integration.upsert({
      where: { projectId_kind: { projectId: project.id, kind } },
      update: { status, label: body.label ?? existing?.label, config: mergedConfig as never },
      create: {
        projectId: project.id,
        kind,
        status,
        label: body.label ?? null,
        config: mergedConfig as never,
      },
    });

    return {
      integration: {
        kind: integration.kind,
        status: integration.status,
        label: integration.label,
      },
    };
  });
}
