import { GoogleGenAI } from "@google/genai";
import { resolveModel } from "./models";
import {
  LlmError,
  parseJson,
  type CompleteArgs,
  type GenerateArgs,
  type LlmProvider,
  type ModelTier,
} from "./types";

export class GeminiProvider implements LlmProvider {
  readonly id = "gemini" as const;
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
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
      const response = await this.client.models.generateContent({
        model: this.modelFor(input.tier),
        contents: input.prompt,
        config: {
          systemInstruction: input.system,
          maxOutputTokens: input.maxTokens,
          ...(input.schema
            ? {
                responseMimeType: "application/json",
                responseSchema: toGeminiSchema(input.schema) as never,
              }
            : {}),
        },
      });

      const text = response.text ?? "";
      if (!text.trim()) {
        const reason = response.candidates?.[0]?.finishReason;
        throw new LlmError(
          `Gemini returned an empty response${reason ? ` (finishReason: ${reason})` : ""}`,
        );
      }
      return text;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError(`Gemini request failed: ${message(error)}`, error);
    }
  }
}

/**
 * Gemini accepts a restricted subset of JSON Schema. Two differences matter for
 * the schemas this app sends:
 *  - `additionalProperties` is rejected, so it is dropped.
 *  - nullability is `nullable: true`, not `type: ["integer", "null"]`.
 *
 * `propertyOrdering` is set from the declared property order because Gemini
 * otherwise picks its own, which makes diffing responses noisier than it needs
 * to be.
 */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "$schema") continue;

    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (value.includes("null")) out.nullable = true;
      continue;
    }

    if (key === "properties" && isRecord(value)) {
      const properties: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(value)) {
        properties[name] = isRecord(child) ? toGeminiSchema(child) : child;
      }
      out.properties = properties;
      out.propertyOrdering = Object.keys(value);
      continue;
    }

    if (key === "items" && isRecord(value)) {
      out.items = toGeminiSchema(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
