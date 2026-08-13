import Anthropic from "@anthropic-ai/sdk";

/**
 * Model tiers per spec 05-ai-features.md.
 *  high  — strategy, quality judging, weekly analysis
 *  mid   — draft generation, audits
 *  light — classification, scoring pre-passes, change detection
 */
export type ModelTier = "high" | "mid" | "light";

export function modelFor(tier: ModelTier): string {
  switch (tier) {
    case "high":
      return process.env.MODEL_HIGH || "claude-opus-5";
    case "mid":
      return process.env.MODEL_MID || "claude-sonnet-5";
    case "light":
      return process.env.MODEL_LIGHT || "claude-haiku-4-5";
  }
}

export type GenerateArgs = {
  tier: ModelTier;
  system: string;
  prompt: string;
  /** JSON Schema. When set, the response is validated against it. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Stable key the offline provider uses to pick a deterministic fixture. */
  offlineKey: string;
  /** Arbitrary context the offline provider may echo back into its fixture. */
  offlineContext?: Record<string, unknown>;
};

export interface LlmProvider {
  readonly name: string;
  generate<T>(args: GenerateArgs): Promise<T>;
  /** Plain-text streaming-free completion, used by the chat surface. */
  complete(args: Omit<GenerateArgs, "schema">): Promise<string>;
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

// ---------------------------------------------------------------- Anthropic

class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate<T>(args: GenerateArgs): Promise<T> {
    const { tier, system, prompt, schema, maxTokens = 16000 } = args;
    try {
      const response = await this.client.messages.create({
        model: modelFor(tier),
        max_tokens: maxTokens,
        system,
        output_config: {
          format: {
            type: "json_schema",
            schema: schema as never,
          },
        },
        messages: [{ role: "user", content: prompt }],
      });

      if (response.stop_reason === "refusal") {
        throw new LlmError("Model declined the request");
      }
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("");
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError("Structured generation failed", error);
    }
  }

  async complete(args: Omit<GenerateArgs, "schema">): Promise<string> {
    const { tier, system, prompt, maxTokens = 8000 } = args;
    try {
      const response = await this.client.messages.create({
        model: modelFor(tier),
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") {
        throw new LlmError("Model declined the request");
      }
      return response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("");
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError("Completion failed", error);
    }
  }
}

// ------------------------------------------------------------------ Offline

/**
 * Deterministic provider. Used when no API key is present and always in E2E, so
 * tests assert on real application logic rather than on model output. Fixtures
 * live in llm-offline.ts and are keyed by `offlineKey`.
 */
class OfflineProvider implements LlmProvider {
  readonly name = "offline";

  async generate<T>(args: GenerateArgs): Promise<T> {
    const { offlineFixture } = await import("@/lib/llm-offline");
    return offlineFixture<T>(args);
  }

  async complete(args: Omit<GenerateArgs, "schema">): Promise<string> {
    const { offlineCompletion } = await import("@/lib/llm-offline");
    return offlineCompletion(args);
  }
}

// ------------------------------------------------------------------ Factory

let cached: LlmProvider | null = null;

export function llm(): LlmProvider {
  if (cached) return cached;
  const mode = process.env.WASABI_LLM_PROVIDER ?? "auto";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (mode === "offline" || (mode === "auto" && !apiKey)) {
    cached = new OfflineProvider();
  } else {
    if (!apiKey) throw new LlmError("ANTHROPIC_API_KEY is required for the anthropic provider");
    cached = new AnthropicProvider(apiKey);
  }
  return cached;
}

/** Test seam. */
export function __setLlmProvider(provider: LlmProvider | null): void {
  cached = provider;
}
