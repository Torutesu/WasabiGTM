/**
 * Encryption for third-party tokens at rest.
 *
 * Integration configs now hold real OAuth access and refresh tokens. A database
 * dump should not hand someone the ability to post as you, so the secret-bearing
 * fields are sealed with AES-GCM before they are written.
 *
 * WebCrypto is used rather than node:crypto so this runs unchanged on edge
 * runtimes as well as Node.
 */

const PREFIX = "enc.v1.";

async function key(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — cannot seal integration tokens");

  // Derive a fixed-length key so any AUTH_SECRET length works.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(plaintext),
  );
  return `${PREFIX}${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function open(value: string): Promise<string> {
  if (!value.startsWith(PREFIX)) return value; // written before sealing existed
  const [ivPart, dataPart] = value.slice(PREFIX.length).split(".");
  if (!ivPart || !dataPart) throw new Error("Malformed sealed value");

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    await key(),
    fromBase64(dataPart),
  );
  return new TextDecoder().decode(plaintext);
}

/** Fields inside an Integration.config that hold a secret. */
const SECRET_FIELDS = [
  "accessToken",
  "refreshToken",
  "installationToken",
  "githubToken",
  "privateKey",
  "secret",
  "clientSecret",
];

export async function sealConfig(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...config };
  for (const field of SECRET_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value && !value.startsWith(PREFIX)) {
      out[field] = await seal(value);
    }
  }
  return out;
}

export async function openConfig(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...config };
  for (const field of SECRET_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value.startsWith(PREFIX)) {
      out[field] = await open(value);
    }
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  // Allocating the buffer explicitly keeps the type as Uint8Array<ArrayBuffer>,
  // which is what WebCrypto's BufferSource requires.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
