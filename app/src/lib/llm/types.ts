/**
 * Model tiers per spec 05-ai-features.md.
 *  high  — strategy, quality judging, weekly analysis
 *  mid   — draft generation, audits
 *  light — classification, scoring pre-passes, change detection
 */
export type ModelTier = "high" | "mid" | "light";

export const TIERS: ModelTier[] = ["high", "mid", "light"];

export type ProviderId = "anthropic" | "openai" | "gemini" | "opencode" | "offline";

export type GenerateArgs = {
  tier: ModelTier;
  system: string;
  prompt: string;
  /** JSON Schema the response must satisfy. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Stable key the offline provider uses to pick a deterministic fixture. */
  offlineKey: string;
  /** Arbitrary context the offline provider may echo back into its fixture. */
  offlineContext?: Record<string, unknown>;
};

export type CompleteArgs = Omit<GenerateArgs, "schema">;

export interface LlmProvider {
  readonly id: ProviderId;
  /** Resolved model id for a tier — surfaced so operators can see what ran. */
  modelFor(tier: ModelTier): string;
  generate<T>(args: GenerateArgs): Promise<T>;
  /** Plain-text completion, used by the chat surface. */
  complete(args: CompleteArgs): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Thrown when a provider is selected but its API key is missing. */
export class MissingApiKeyError extends LlmError {
  constructor(provider: ProviderId, envVar: string) {
    super(`${provider} is selected but ${envVar} is not set`);
    this.name = "MissingApiKeyError";
  }
}

/**
 * Models can wrap JSON in prose or a code fence when the provider only offers
 * a loose JSON mode. Pull out the first complete JSON value rather than failing.
 */
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    // Fall through to a bracket scan.
  }

  const start = withoutFence.search(/[{[]/);
  if (start === -1) throw new LlmError(`Model did not return JSON: ${truncate(raw)}`);

  const open = withoutFence[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < withoutFence.length; i += 1) {
    const char = withoutFence[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        const candidate = withoutFence.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch (error) {
          throw new LlmError(`Model returned malformed JSON: ${truncate(candidate)}`, error);
        }
      }
    }
  }

  throw new LlmError(`Model returned truncated JSON: ${truncate(raw)}`);
}

function truncate(value: string, limit = 200): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}
