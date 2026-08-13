import OpenAI from "openai";
import { resolveModel } from "./models";
import {
  LlmError,
  parseJson,
  type CompleteArgs,
  type GenerateArgs,
  type LlmProvider,
  type ModelTier,
  type ProviderId,
} from "./types";

/**
 * Backs every provider that speaks the OpenAI chat-completions shape — OpenAI
 * itself and OpenCode Zen, which fronts a mixed catalogue behind one key.
 *
 * `schemaMode` differs between them:
 *  - `json_schema` — strict Structured Outputs. Correct for OpenAI.
 *  - `json_object` — loose JSON mode with the schema restated in the prompt.
 *    The right default for a gateway whose catalogue includes models that do
 *    not implement strict schemas; we fall back to it automatically if the
 *    endpoint rejects `json_schema`.
 */
export type SchemaMode = "json_schema" | "json_object";

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: ProviderId;
  private client: OpenAI;
  private schemaMode: SchemaMode;
  private label: string;
  /** Set once an endpoint has told us it cannot do strict schemas. */
  private strictSchemaUnsupported = false;

  constructor(input: {
    id: ProviderId;
    label: string;
    apiKey: string;
    baseURL?: string;
    schemaMode: SchemaMode;
  }) {
    this.id = input.id;
    this.label = input.label;
    this.schemaMode = input.schemaMode;
    this.client = new OpenAI({
      apiKey: input.apiKey,
      ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    });
  }

  modelFor(tier: ModelTier): string {
    return resolveModel(this.id, tier);
  }

  async generate<T>(args: GenerateArgs): Promise<T> {
    const useStrict = this.schemaMode === "json_schema" && !this.strictSchemaUnsupported;

    if (useStrict) {
      try {
        const text = await this.request({
          tier: args.tier,
          system: args.system,
          prompt: args.prompt,
          maxTokens: args.maxTokens ?? 16000,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "wasabi_response",
              schema: args.schema,
              strict: true,
            },
          },
        });
        return parseJson<T>(text);
      } catch (error) {
        if (!isSchemaUnsupported(error)) throw error;
        // Remember, so the whole run doesn't pay for this probe twice.
        this.strictSchemaUnsupported = true;
      }
    }

    const text = await this.request({
      tier: args.tier,
      system: `${args.system}\n\n${schemaInstruction(args.schema)}`,
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? 16000,
      responseFormat: { type: "json_object" },
    });
    return parseJson<T>(text);
  }

  async complete(args: CompleteArgs): Promise<string> {
    return this.request({
      tier: args.tier,
      system: args.system,
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? 8000,
    });
  }

  private async request(input: {
    tier: ModelTier;
    system: string;
    prompt: string;
    maxTokens: number;
    responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"];
  }): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelFor(input.tier),
        max_completion_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
      });

      const choice = response.choices[0];
      if (choice?.finish_reason === "content_filter") {
        throw new LlmError(`${this.label} declined the request (content filter)`);
      }
      const text = choice?.message?.content ?? "";
      if (!text.trim()) {
        throw new LlmError(`${this.label} returned an empty response`);
      }
      return text;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError(`${this.label} request failed: ${message(error)}`, error);
    }
  }
}

/**
 * A gateway that does not implement strict Structured Outputs rejects the
 * request rather than degrading, so treat that specific complaint — and only
 * that one — as a signal to retry in loose JSON mode.
 */
function isSchemaUnsupported(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status !== 400 && status !== 404 && status !== 422) return false;
  const text = message(error).toLowerCase();
  return (
    text.includes("json_schema") ||
    text.includes("response_format") ||
    text.includes("structured output") ||
    text.includes("not supported")
  );
}

function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    "Reply with a single JSON object and nothing else — no prose, no code fence.",
    "It must validate against this JSON Schema:",
    JSON.stringify(schema),
  ].join("\n");
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
