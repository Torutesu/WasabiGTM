import { db } from "@/lib/db";
import { BadRequestError, projectBySlug, withUser } from "@/lib/api";
import { saveConfig } from "@/lib/oauth";
import { IntegrationKind, IntegrationStatus } from "@wasabi/prisma/client";

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

    // saveConfig seals the secret-bearing fields, so a token handed to this
    // endpoint (a GitHub PAT, a CMS shared secret) never lands in plaintext.
    await saveConfig({
      projectId: project.id,
      kind,
      status,
      label: body.label ?? null,
      config: body.config ?? {},
      merge: true,
    });

    const integration = await db.integration.findUniqueOrThrow({
      where: { projectId_kind: { projectId: project.id, kind } },
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
