import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { STATE_COOKIE, appOrigin, decodeState, saveConfig } from "@/lib/oauth";
import { installationRepos, mintInstallationToken, pickRepo } from "@/lib/github-app";
import { IntegrationKind, IntegrationStatus } from "@wasabi/prisma/client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const returnedState = url.searchParams.get("state");

  const fail = (reason: string, slug?: string) =>
    NextResponse.redirect(
      `${appOrigin(request)}/projects/${slug ?? ""}/integrations?error=${encodeURIComponent(reason)}`,
    );

  try {
    await requireUser();

    const jar = await cookies();
    const storedState = jar.get(STATE_COOKIE)?.value;
    if (!storedState || !returnedState || storedState !== returnedState) {
      return fail("Install state mismatch — start the connection again");
    }
    const state = decodeState(storedState);
    const project = await projectBySlug(state.projectSlug);

    if (!installationId) {
      return fail("GitHub returned no installation id — was the install cancelled?", project.slug);
    }

    // Mint once here so a misconfigured private key surfaces now, not at the
    // first publish attempt.
    const token = await mintInstallationToken(installationId);
    const repos = await installationRepos(token.token);
    const repo = pickRepo(repos, project.name, project.url);

    await saveConfig({
      projectId: project.id,
      kind: IntegrationKind.GITHUB_APP,
      status: IntegrationStatus.CONNECTED,
      label: repo || `installation ${installationId}`,
      config: {
        installationId,
        repo,
        // Cached so a burst of publishes does not re-mint on every call.
        installationToken: token.token,
        installationExpiresAt: token.expiresAt,
        availableRepos: repos.slice(0, 50),
      },
    });

    const response = NextResponse.redirect(
      `${appOrigin(request)}/projects/${project.slug}/integrations?connected=GITHUB_APP`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "GitHub install failed");
  }
}
