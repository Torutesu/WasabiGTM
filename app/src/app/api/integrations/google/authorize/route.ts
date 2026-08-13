import { NextResponse } from "next/server";
import { errorResponse, projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { STATE_COOKIE, appOrigin, encodeState, randomString } from "@/lib/oauth";
import { IntegrationKind } from "@/generated/prisma/client";

/**
 * One consent screen covers both Search Console and Analytics; `kind` decides
 * which integration record the callback writes.
 */
const SCOPES: Record<string, string[]> = {
  GSC: ["https://www.googleapis.com/auth/webmasters.readonly"],
  GA: ["https://www.googleapis.com/auth/analytics.readonly"],
};

export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams;
    const slug = params.get("project");
    const kind = params.get("kind") ?? "GSC";
    if (!slug) throw new Error("project is required");
    if (!SCOPES[kind]) throw new Error(`kind must be GSC or GA, got ${kind}`);
    await projectBySlug(slug);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "GOOGLE_CLIENT_ID is not set — see .env.example" },
        { status: 500 },
      );
    }

    const state = encodeState({
      projectSlug: slug,
      kind: kind as IntegrationKind,
      verifier: "",
      nonce: randomString(16),
    });

    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set(
      "redirect_uri",
      `${appOrigin(request)}/api/integrations/google/callback`,
    );
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", SCOPES[kind].join(" "));
    // Google only returns a refresh token on the first consent unless we force
    // the prompt, and without one the connection dies within the hour.
    authorize.searchParams.set("access_type", "offline");
    authorize.searchParams.set("prompt", "consent");
    authorize.searchParams.set("state", state);

    const response = NextResponse.redirect(authorize.toString());
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
