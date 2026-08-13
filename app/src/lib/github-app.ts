/**
 * GitHub App authentication.
 *
 * A GitHub App does not hold a long-lived token. It signs a short JWT with its
 * private key, exchanges that for an installation access token that expires in
 * an hour, and uses the installation token for API calls. That is why the PR
 * path mints a token per run rather than storing one.
 *
 * A fine-grained personal access token works too and skips all of this — see
 * `githubToken` in the integration config.
 */

export type InstallationToken = { token: string; expiresAt: number };

export function appConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

export function appSlug(): string {
  return process.env.GITHUB_APP_SLUG ?? "";
}

/** A JWT signed with the app's private key, valid for ten minutes. */
export async function appJwt(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const pem = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !pem) throw new Error("GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY are not set");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  // Backdating by a minute absorbs clock skew, which GitHub rejects outright.
  const payload = { iat: now - 60, exp: now + 540, iss: appId };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await importPrivateKey(pem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

/** Exchanges the app JWT for a token scoped to one installation. */
export async function mintInstallationToken(installationId: string): Promise<InstallationToken> {
  const jwt = await appJwt();
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "WasabiBot/1.0",
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `GitHub App token exchange failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as { token?: string; expires_at?: string };
  if (!data.token) throw new Error("GitHub App returned no installation token");
  return {
    token: data.token,
    expiresAt: data.expires_at ? Date.parse(data.expires_at) : Date.now() + 3_300_000,
  };
}

/** Repositories the installation can reach, newest first. */
export async function installationRepos(token: string): Promise<string[]> {
  const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "WasabiBot/1.0",
    },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { repositories?: Array<{ full_name?: string }> };
  return (data.repositories ?? []).map((repo) => repo.full_name ?? "").filter(Boolean);
}

/** The repo whose name best matches the project, falling back to the first one. */
export function pickRepo(repos: string[], projectName: string, projectUrl: string): string {
  if (repos.length === 0) return "";
  const needles = [projectName.toLowerCase().replace(/\s+/g, "-"), hostOf(projectUrl)].filter(
    Boolean,
  );
  const match = repos.find((repo) => {
    const name = repo.split("/")[1]?.toLowerCase() ?? "";
    return needles.some((needle) => needle && (name.includes(needle) || needle.includes(name)));
  });
  return match ?? repos[0];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
  } catch {
    return "";
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Env vars often carry the PEM with literal \n, so restore real newlines.
  const normalized = pem.replace(/\\n/g, "\n").trim();
  if (normalized.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY is in PKCS#1 form. Convert it once with: " +
        "openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key.pkcs8.pem",
    );
  }
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  return crypto.subtle.importKey(
    "pkcs8",
    fromBase64(body),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
