/**
 * OpenNext adapter config for the Cloudflare Workers deployment.
 * Copy to the app root next to next.config.ts before building.
 *
 * The defaults are deliberate: every page in this app is dynamic and
 * per-project, so an incremental cache would only add moving parts. Add
 * r2IncrementalCache here if static generation is introduced later.
 */
// @ts-expect-error - installed only for the Cloudflare deployment
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
