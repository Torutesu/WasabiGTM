import type { ModelTier, ProviderId } from "./types";

/**
 * Per-provider defaults for each tier.
 *
 * Resolution order for a tier, first match wins:
 *   1. <PROVIDER>_MODEL_<TIER>   e.g. OPENAI_MODEL_HIGH
 *   2. MODEL_<TIER>              applies to whichever provider is active
 *   3. the default below
 */
const DEFAULTS: Record<Exclude<ProviderId, "offline">, Record<ModelTier, string>> = {
  anthropic: {
    high: "claude-opus-5",
    mid: "claude-sonnet-5",
    light: "claude-haiku-4-5",
  },
  openai: {
    high: "gpt-5.6-sol",
    mid: "gpt-5.5",
    light: "gpt-5.4-mini",
  },
  gemini: {
    high: "gemini-3.6-pro",
    mid: "gemini-3.6-flash",
    light: "gemini-3.5-flash",
  },
  // OpenCode Zen fronts a mixed catalogue; these are its coding-oriented tiers.
  opencode: {
    high: "claude-opus-5",
    mid: "claude-sonnet-5",
    light: "gemini-3.6-flash",
  },
};

export function resolveModel(provider: ProviderId, tier: ModelTier): string {
  const upperTier = tier.toUpperCase();
  const specific = process.env[`${provider.toUpperCase()}_MODEL_${upperTier}`];
  if (specific) return specific;

  const generic = process.env[`MODEL_${upperTier}`];
  if (generic) return generic;

  if (provider === "offline") return `offline-${tier}`;
  return DEFAULTS[provider][tier];
}

export function defaultModels(provider: ProviderId): Record<ModelTier, string> {
  return {
    high: resolveModel(provider, "high"),
    mid: resolveModel(provider, "mid"),
    light: resolveModel(provider, "light"),
  };
}
