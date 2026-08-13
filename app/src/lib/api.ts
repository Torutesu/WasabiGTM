import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { IntegrationError } from "@/lib/external";

export type Handler<T> = (ctx: { user: SessionUser }) => Promise<T>;

/** Wraps a route handler with auth + uniform error shaping. */
export async function withUser<T>(handler: Handler<T>): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const data = await handler({ user });
    return NextResponse.json(data as Record<string, unknown>);
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof IntegrationError) {
    const status = error.code === "NOT_CONNECTED" ? 409 : 422;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** Resolves a project by slug, or throws a 404-shaped error. */
export async function projectBySlug(slug: string) {
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) throw new NotFoundError(`Project ${slug} not found`);
  return project;
}
