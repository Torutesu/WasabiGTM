import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { STATE_COOKIE, appOrigin, decodeState, saveConfig, toTokenSet } from "@/lib/oauth";
import { IntegrationKind, IntegrationStatus } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const fail = (reason: string, slug?: string) =>
    NextResponse.redirect(
      `${appOrigin(request)}/projects/${slug ?? ""}/integrations?error=${encodeURIComponent(reason)}`,
    );

  try {
    await requireUser();

    const jar = await cookies();
    const storedState = jar.get(STATE_COOKIE)?.value;
    // Comparing against the cookie is what stops a forged callback.
    if (!storedState || !returnedState || storedState !== returnedState) {
      return fail("OAuth state mismatch — start the connection again");
    }
    const state = decodeState(storedState);
    const project = await projectBySlug(state.projectSlug);

    if (denied) return fail(`X denied the connection: ${denied}`, project.slug);
    if (!code) return fail("X returned no authorization code", project.slug);

    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId) return fail("X_CLIENT_ID is not set", project.slug);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${appOrigin(request)}/api/integrations/x/callback`,
      code_verifier: state.verifier,
      client_id: clientId,
    });

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    // Confidential clients authenticate with Basic; public clients send only the id.
    if (clientSecret) {
      headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    }

    const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers,
      body,
    });
    const payload = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenResponse.ok) {
      return fail(
        `X token exchange failed (${tokenResponse.status}): ${String(payload.error_description ?? payload.error ?? "")}`,
        project.slug,
      );
    }

    const tokens = toTokenSet(payload);

    // Record the handle so the UI can show which account will post.
    let handle = "";
    const me = await fetch("https://api.x.com/2/users/me", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (me.ok) {
      const data = (await me.json()) as { data?: { username?: string } };
      handle = data.data?.username ?? "";
    }

    await saveConfig({
      projectId: project.id,
      kind: IntegrationKind.X_OAUTH,
      status: IntegrationStatus.CONNECTED,
      label: handle ? `@${handle}` : null,
      config: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
        handle,
      },
    });

    const response = NextResponse.redirect(
      `${appOrigin(request)}/projects/${project.slug}/integrations?connected=X_OAUTH`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "OAuth callback failed");
  }
}
