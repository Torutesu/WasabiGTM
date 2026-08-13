import Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "./models";
import {
  LlmError,
  parseJson,
  type CompleteArgs,
  type GenerateArgs,
  type LlmProvider,
  type ModelTier,
} from "./types";

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  modelFor(tier: ModelTier): string {
    return resolveModel(this.id, tier);
  }

  async generate<T>(args: GenerateArgs): Promise<T> {
    const text = await this.call({
      tier: args.tier,
      system: args.system,
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? 16000,
      schema: args.schema,
    });
    return parseJson<T>(text);
  }

  async complete(args: CompleteArgs): Promise<string> {
    return this.call({
      tier: args.tier,
      system: args.system,
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? 8000,
    });
  }

  private async call(input: {
    tier: ModelTier;
    system: string;
    prompt: string;
    maxTokens: number;
    schema?: Record<string, unknown>;
  }): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.modelFor(input.tier),
        max_tokens: input.maxTokens,
        system: input.system,
        ...(input.schema
          ? {
              output_config: {
                format: { type: "json_schema" as const, schema: input.schema as never },
              },
            }
          : {}),
        messages: [{ role: "user", content: input.prompt }],
      });

      if (response.stop_reason === "refusal") {
        throw new LlmError(
          `Model declined the request${
            response.stop_details ? ` (${JSON.stringify(response.stop_details)})` : ""
          }`,
        );
      }

      return response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("");
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError(`Anthropic request failed: ${message(error)}`, error);
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
