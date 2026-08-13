import { NextResponse } from "next/server";
import { errorResponse, projectBySlug } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { STATE_COOKIE, encodeState, randomString } from "@/lib/oauth";
import { appConfigured, appSlug } from "@/lib/github-app";
import { IntegrationKind } from "@wasabi/prisma/client";

/**
 * Sends the user to install the GitHub App on the repository they want fixes
 * against. There is no OAuth consent screen here — an App is *installed*, and
 * the callback receives the installation id.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
    const slug = new URL(request.url).searchParams.get("project");
    if (!slug) throw new Error("project is required");
    await projectBySlug(slug);

    if (!appConfigured() || !appSlug()) {
      return NextResponse.json(
        {
          error:
            "GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_SLUG and " +
            "GITHUB_APP_PRIVATE_KEY, or paste a fine-grained token instead.",
        },
        { status: 500 },
      );
    }

    const state = encodeState({
      projectSlug: slug,
      kind: IntegrationKind.GITHUB_APP,
      verifier: "",
      nonce: randomString(16),
    });

    const install = new URL(`https://github.com/apps/${appSlug()}/installations/new`);
    install.searchParams.set("state", state);

    const response = NextResponse.redirect(install.toString());
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
