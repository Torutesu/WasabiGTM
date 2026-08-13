import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OfflineProvider } from "./offline";
import { OpenAiCompatibleProvider, type SchemaMode } from "./openai-compatible";
import { defaultModels } from "./models";
import {
  LlmError,
  MissingApiKeyError,
  TIERS,
  type LlmProvider,
  type ModelTier,
  type ProviderId,
} from "./types";

export {
  LlmError,
  MissingApiKeyError,
  type CompleteArgs,
  type GenerateArgs,
  type LlmProvider,
  type ModelTier,
  type ProviderId,
} from "./types";
export { toGeminiSchema } from "./gemini";
export { resolveModel } from "./models";

/**
 * Every supported vendor, with the environment variable that holds its key.
 * `auto` walks this list in order and picks the first one that has a key.
 */
export const PROVIDERS: Array<{
  id: Exclude<ProviderId, "offline">;
  label: string;
  keyEnv: string;
  baseUrlEnv: string;
  /** Vendors whose own endpoint implements strict Structured Outputs. */
  schemaMode: SchemaMode;
  defaultBaseUrl?: string;
}> = [
  {
    id: "anthropic",
    label: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    schemaMode: "json_schema",
  },
  {
    id: "openai",
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    schemaMode: "json_schema",
  },
  {
    id: "gemini",
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    baseUrlEnv: "GEMINI_BASE_URL",
    schemaMode: "json_schema",
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    keyEnv: "OPENCODE_API_KEY",
    baseUrlEnv: "OPENCODE_BASE_URL",
    // The Zen catalogue mixes vendors, so start loose and let the provider
    // upgrade itself if the endpoint turns out to accept strict schemas.
    schemaMode: "json_object",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
  },
];

function keyFor(id: ProviderId): string | undefined {
  const entry = PROVIDERS.find((p) => p.id === id);
  if (!entry) return undefined;
  const value = process.env[entry.keyEnv];
  return value && value.trim() ? value.trim() : undefined;
}

function baseUrlFor(id: ProviderId): string | undefined {
  const entry = PROVIDERS.find((p) => p.id === id);
  if (!entry) return undefined;
  return process.env[entry.baseUrlEnv]?.trim() || entry.defaultBaseUrl;
}

function schemaModeFor(id: ProviderId): SchemaMode {
  const override = process.env[`${id.toUpperCase()}_SCHEMA_MODE`];
  if (override === "json_schema" || override === "json_object") return override;
  return PROVIDERS.find((p) => p.id === id)?.schemaMode ?? "json_object";
}

export function build(id: ProviderId): LlmProvider {
  if (id === "offline") return new OfflineProvider();

  const entry = PROVIDERS.find((p) => p.id === id);
  if (!entry) throw new LlmError(`Unknown LLM provider: ${id}`);

  const apiKey = keyFor(id);
  if (!apiKey) throw new MissingApiKeyError(id, entry.keyEnv);

  switch (id) {
    case "anthropic":
      return new AnthropicProvider(apiKey, baseUrlFor(id));
    case "gemini":
      return new GeminiProvider(apiKey);
    case "openai":
    case "opencode":
      return new OpenAiCompatibleProvider({
        id,
        label: entry.label,
        apiKey,
        baseURL: baseUrlFor(id),
        schemaMode: schemaModeFor(id),
      });
  }
}

/** Which provider `auto` would choose, or null when no key is configured. */
export function firstConfiguredProvider(): ProviderId | null {
  for (const entry of PROVIDERS) {
    if (keyFor(entry.id)) return entry.id;
  }
  return null;
}

function selectProviderId(): ProviderId {
  const configured = (process.env.WASABI_LLM_PROVIDER ?? "auto").trim().toLowerCase();

  if (configured === "offline") return "offline";
  if (configured !== "auto") {
    const known = PROVIDERS.some((p) => p.id === configured);
    if (!known) {
      throw new LlmError(
        `WASABI_LLM_PROVIDER="${configured}" is not a known provider. ` +
          `Use one of: ${PROVIDERS.map((p) => p.id).join(", ")}, offline, auto.`,
      );
    }
    return configured as ProviderId;
  }

  return firstConfiguredProvider() ?? "offline";
}

let cached: LlmProvider | null = null;

export function llm(): LlmProvider {
  if (cached) return cached;
  cached = build(selectProviderId());
  return cached;
}

/** Test seam, also used to re-read configuration after an env change. */
export function __setLlmProvider(provider: LlmProvider | null): void {
  cached = provider;
}

export type LlmStatus = {
  provider: ProviderId;
  /** True when `auto` fell through to offline because no key was configured. */
  usingOfflineFallback: boolean;
  models: Record<ModelTier, string>;
  configuredKeys: Array<{ id: ProviderId; label: string; keyEnv: string; present: boolean }>;
};

/**
 * Describes the active provider. Surfaced in the UI because "which model wrote
 * this" is the first question when output quality changes — and because an
 * unset key silently selects the offline provider, which is worth showing.
 */
export function describeLlm(): LlmStatus {
  const provider = selectProviderId();
  const explicit = (process.env.WASABI_LLM_PROVIDER ?? "auto").trim().toLowerCase();

  const models = defaultModels(provider);
  return {
    provider,
    usingOfflineFallback:
      provider === "offline" && explicit !== "offline" && firstConfiguredProvider() === null,
    models: Object.fromEntries(TIERS.map((tier) => [tier, models[tier]])) as Record<
      ModelTier,
      string
    >,
    configuredKeys: PROVIDERS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      keyEnv: entry.keyEnv,
      present: Boolean(keyFor(entry.id)),
    })),
  };
}
