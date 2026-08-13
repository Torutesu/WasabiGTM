import { db } from "@/lib/db";
import { openConfig, sealConfig } from "@/lib/secrets";
import { IntegrationKind, IntegrationStatus } from "@/generated/prisma/client";

/**
 * Shared OAuth plumbing: PKCE, the state round-trip, and token refresh.
 *
 * Tokens live in Integration.config, sealed by src/lib/secrets.ts. Reading goes
 * through `loadConfig` so callers never see ciphertext; writing goes through
 * `saveConfig` so a plaintext token cannot be persisted by accident.
 */

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch millis. */
  expiresAt?: number;
  scope?: string;
};

export async function loadConfig(
  projectId: string,
  kind: IntegrationKind,
): Promise<Record<string, unknown> | null> {
  const row = await db.integration.findUnique({
    where: { projectId_kind: { projectId, kind } },
  });
  if (!row) return null;
  return openConfig((row.config ?? {}) as Record<string, unknown>);
}

export async function saveConfig(input: {
  projectId: string;
  kind: IntegrationKind;
  status: IntegrationStatus;
  label?: string | null;
  config: Record<string, unknown>;
  /** Merge into the stored config rather than replacing it. */
  merge?: boolean;
}): Promise<void> {
  const existing = input.merge ? await loadConfig(input.projectId, input.kind) : null;
  const merged = { ...(existing ?? {}), ...input.config };
  const sealed = await sealConfig(merged);

  await db.integration.upsert({
    where: { projectId_kind: { projectId: input.projectId, kind: input.kind } },
    update: { status: input.status, label: input.label ?? undefined, config: sealed as never },
    create: {
      projectId: input.projectId,
      kind: input.kind,
      status: input.status,
      label: input.label ?? null,
      config: sealed as never,
    },
  });
}

/** Marks an integration broken so the UI can offer Reconnect. */
export async function markIntegrationError(
  projectId: string,
  kind: IntegrationKind,
  reason: string,
): Promise<void> {
  await db.integration
    .update({
      where: { projectId_kind: { projectId, kind } },
      data: { status: IntegrationStatus.ERROR, label: reason.slice(0, 200) },
    })
    .catch(() => {
      // The integration may have been removed mid-flight; nothing to mark.
    });
}

// ------------------------------------------------------------------- PKCE

export function randomString(bytes = 32): string {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(array);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ------------------------------------------------------------ state cookie

const STATE_COOKIE = "wasabi_oauth";

export type OAuthState = {
  projectSlug: string;
  kind: IntegrationKind;
  verifier: string;
  nonce: string;
  /** Extra data a provider needs on the way back (e.g. the chosen GA property). */
  extra?: Record<string, string>;
};

export function encodeState(state: OAuthState): string {
  return btoa(JSON.stringify(state)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(value: string): OAuthState {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded)) as OAuthState;
}

export { STATE_COOKIE };

// ------------------------------------------------------------------ tokens

/**
 * Returns a valid access token, refreshing first if it is within a minute of
 * expiry. Providers differ only in how they exchange, so that part is injected.
 */
export async function freshAccessToken(input: {
  projectId: string;
  kind: IntegrationKind;
  config: Record<string, unknown>;
  refresh: (refreshToken: string) => Promise<TokenSet>;
}): Promise<string> {
  const accessToken = String(input.config.accessToken ?? "");
  const refreshToken = String(input.config.refreshToken ?? "");
  const expiresAt = Number(input.config.expiresAt ?? 0);

  const stillValid = accessToken && (!expiresAt || expiresAt - Date.now() > 60_000);
  if (stillValid) return accessToken;

  if (!refreshToken) {
    throw new OAuthExpiredError("No refresh token — reconnect this integration");
  }

  const next = await input.refresh(refreshToken);
  await saveConfig({
    projectId: input.projectId,
    kind: input.kind,
    status: IntegrationStatus.CONNECTED,
    merge: true,
    config: {
      accessToken: next.accessToken,
      // Some providers rotate the refresh token; keep the old one if they don't.
      refreshToken: next.refreshToken ?? refreshToken,
      expiresAt: next.expiresAt ?? null,
      scope: next.scope ?? input.config.scope ?? null,
    },
  });
  return next.accessToken;
}

export class OAuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthExpiredError";
  }
}

/** Parses an OAuth token endpoint response into our shape. */
export function toTokenSet(payload: Record<string, unknown>): TokenSet {
  const accessToken = String(payload.access_token ?? "");
  if (!accessToken) {
    throw new OAuthExpiredError(
      `Token endpoint returned no access_token: ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  const expiresIn = Number(payload.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : undefined,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    scope: payload.scope ? String(payload.scope) : undefined,
  };
}

/** The app's own origin, used to build OAuth redirect URIs. */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  // Respect the proxy headers a tunnel or CDN sets, so the redirect URI matches
  // what the user actually browsed to.
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
