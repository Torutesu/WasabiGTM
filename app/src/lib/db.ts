import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wasabi/prisma/client";

/**
 * One client per process on Node, one per request on Cloudflare Workers.
 *
 * A Worker cannot carry a socket across requests: the second request to reach
 * for a connection opened by the first one hangs until the runtime cancels it.
 * So on Workers the client is keyed to the request context — the runtime closes
 * those sockets when the request ends — while on Node the long-lived singleton
 * is both correct and much cheaper.
 *
 * `db` is therefore a proxy rather than an instance: which client a call lands
 * on can only be decided when the call is made, not when this module loads.
 */

// Set per request by @opennextjs/cloudflare (AsyncLocalStorage-backed), absent
// everywhere else — which is exactly the signal we need.
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type RequestContext = object;

function cloudflareRequest(): RequestContext | undefined {
  const global = globalThis as Record<symbol, { ctx?: RequestContext } | undefined>;
  return global[CLOUDFLARE_CONTEXT]?.ctx;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const perRequest = new WeakMap<RequestContext, PrismaClient>();

function client(): PrismaClient {
  const request = cloudflareRequest();
  if (request) {
    const existing = perRequest.get(request);
    if (existing) return existing;
    const created = createClient();
    perRequest.set(request, created);
    return created;
  }

  // Held on the global so a dev server's hot reloads do not each open a pool.
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const active = client() as unknown as Record<string | symbol, unknown>;
    const value = active[property];
    return typeof value === "function" ? value.bind(active) : value;
  },
});
