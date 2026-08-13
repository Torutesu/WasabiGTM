import "dotenv/config";
import { PROVIDERS, build, describeLlm } from "../src/lib/llm";
import type { ProviderId } from "../src/lib/llm";

/**
 * Smoke-checks a provider end to end with one cheap structured call.
 *
 *   npx tsx scripts/check-provider.ts            # the active provider
 *   npx tsx scripts/check-provider.ts openai     # a specific one
 *
 * Use it after setting a key: it proves the key, endpoint, model id, and
 * structured-output path all work together, which nothing else verifies (the
 * E2E suite deliberately runs on offline fixtures).
 */
const SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    provider_said: { type: "string" },
  },
  required: ["ok", "provider_said"],
  additionalProperties: false,
} as const;

async function main() {
  const requested = process.argv[2] as ProviderId | undefined;
  const status = describeLlm();

  if (!requested) {
    console.log(`Active provider: ${status.provider}`);
    console.log(`Models: ${JSON.stringify(status.models)}`);
    for (const key of status.configuredKeys) {
      console.log(`  ${key.present ? "●" : "○"} ${key.label} (${key.keyEnv})`);
    }
    if (status.usingOfflineFallback) {
      console.log("\nNo vendor key set — running on offline fixtures.");
    }
  }

  const id = requested ?? status.provider;
  const known = [...PROVIDERS.map((p) => p.id), "offline"];
  if (!known.includes(id)) {
    console.error(`Unknown provider "${id}". Known: ${known.join(", ")}`);
    process.exit(1);
  }

  console.log(`\nCalling ${id}…`);
  const started = Date.now();
  try {
    const provider = build(id);
    const result = await provider.generate<{ ok: boolean; provider_said: string }>({
      tier: "light",
      system: "You are a health check. Answer concisely.",
      prompt: 'Reply with ok=true and provider_said set to the word "ready".',
      schema: SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 200,
      offlineKey: "context-diff",
      offlineContext: { before: "a", after: "b" },
    });
    console.log(`  model:   ${provider.modelFor("light")}`);
    console.log(`  elapsed: ${Date.now() - started}ms`);
    console.log(`  result:  ${JSON.stringify(result)}`);
    console.log("\nOK");
  } catch (error) {
    console.error(`\nFAILED after ${Date.now() - started}ms`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
