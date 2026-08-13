import { NextResponse } from "next/server";
import { errorResponse, projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  STATE_COOKIE,
  appOrigin,
  encodeState,
  pkceChallenge,
  randomString,
} from "@/lib/oauth";
import { IntegrationKind } from "@/generated/prisma/client";

/** Starts the X OAuth 2.0 authorization-code flow with PKCE. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const slug = new URL(request.url).searchParams.get("project");
    if (!slug) throw new Error("project is required");
    await projectBySlug(slug);

    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "X_CLIENT_ID is not set — see .env.example" },
        { status: 500 },
      );
    }

    const verifier = randomString();
    const nonce = randomString(16);
    const state = encodeState({
      projectSlug: slug,
      kind: IntegrationKind.X_OAUTH,
      verifier,
      nonce,
    });

    const authorize = new URL("https://x.com/i/oauth2/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", `${appOrigin(request)}/api/integrations/x/callback`);
    // offline.access is what yields a refresh token; without it the connection
    // silently dies after a couple of hours.
    authorize.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", await pkceChallenge(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");

    const response = NextResponse.redirect(authorize.toString());
    // The verifier must not travel in the URL, so it rides a short-lived cookie.
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
