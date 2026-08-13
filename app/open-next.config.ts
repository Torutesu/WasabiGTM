import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config for the Cloudflare Workers deployment.
 *
 * No incremental cache is configured on purpose: every page in this app is
 * dynamic and scoped to one project, so an R2-backed ISR cache would add a
 * bucket and a Durable Object without ever serving a hit. Add
 * `incrementalCache: r2IncrementalCache` here if static generation appears.
 */
export default defineCloudflareConfig({});
