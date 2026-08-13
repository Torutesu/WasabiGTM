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
    if (!storedState || !returnedState || storedState !== returnedState) {
      return fail("OAuth state mismatch — start the connection again");
    }
    const state = decodeState(storedState);
    const project = await projectBySlug(state.projectSlug);

    if (denied) return fail(`Google denied the connection: ${denied}`, project.slug);
    if (!code) return fail("Google returned no authorization code", project.slug);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail("Google OAuth is not configured", project.slug);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appOrigin(request)}/api/integrations/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const payload = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenResponse.ok) {
      return fail(
        `Google token exchange failed (${tokenResponse.status}): ${String(payload.error_description ?? payload.error ?? "")}`,
        project.slug,
      );
    }

    const tokens = toTokenSet(payload);
    const kind = state.kind;

    // Pick the property that matches this project so the user does not have to.
    let target = "";
    let label: string | null = null;
    if (kind === IntegrationKind.GSC) {
      target = await pickSearchConsoleSite(tokens.accessToken, project.url);
      label = target || null;
    } else {
      const property = await pickAnalyticsProperty(tokens.accessToken, project.name);
      target = property.id;
      label = property.label;
    }

    await saveConfig({
      projectId: project.id,
      kind,
      status: IntegrationStatus.CONNECTED,
      label,
      config: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
        ...(kind === IntegrationKind.GSC ? { siteUrl: target } : { propertyId: target }),
      },
    });

    const response = NextResponse.redirect(
      `${appOrigin(request)}/projects/${project.slug}/integrations?connected=${kind}`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "OAuth callback failed");
  }
}

/** Chooses the verified property whose host matches the project's URL. */
async function pickSearchConsoleSite(accessToken: string, projectUrl: string): Promise<string> {
  const response = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const data = (await response.json()) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  };

  let host = "";
  try {
    host = new URL(projectUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }

  const usable = (data.siteEntry ?? []).filter(
    (entry) => entry.permissionLevel !== "siteUnverifiedUser",
  );
  const match = usable.find((entry) => (entry.siteUrl ?? "").includes(host));
  return match?.siteUrl ?? usable[0]?.siteUrl ?? "";
}

async function pickAnalyticsProperty(
  accessToken: string,
  projectName: string,
): Promise<{ id: string; label: string | null }> {
  const response = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return { id: "", label: null };
  const data = (await response.json()) as {
    accountSummaries?: Array<{
      propertySummaries?: Array<{ property?: string; displayName?: string }>;
    }>;
  };

  const properties = (data.accountSummaries ?? []).flatMap((a) => a.propertySummaries ?? []);
  const match =
    properties.find((p) =>
      (p.displayName ?? "").toLowerCase().includes(projectName.toLowerCase()),
    ) ?? properties[0];

  // The API returns "properties/123456"; the Data API wants the bare id.
  const id = (match?.property ?? "").replace(/^properties\//, "");
  return { id, label: match?.displayName ?? null };
}
