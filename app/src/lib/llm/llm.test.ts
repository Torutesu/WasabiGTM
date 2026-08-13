import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { toGeminiSchema } from "./gemini";
import { resolveModel } from "./models";
import { LlmError, parseJson } from "./types";
import { PROVIDERS, __setLlmProvider, describeLlm, firstConfiguredProvider, llm } from "./index";

/**
 * These cover the pure logic the E2E suite cannot reach: it runs on the offline
 * provider, so provider selection, schema translation, and JSON extraction are
 * never exercised there.
 */

const KEY_VARS = PROVIDERS.map((p) => p.keyEnv);

function clearEnv() {
  for (const key of [...KEY_VARS, "WASABI_LLM_PROVIDER", "MODEL_HIGH", "OPENAI_MODEL_HIGH"]) {
    delete process.env[key];
  }
  __setLlmProvider(null);
}

afterEach(clearEnv);

describe("provider selection", () => {
  it("falls back to offline when no key is configured", () => {
    clearEnv();
    assert.equal(firstConfiguredProvider(), null);
    assert.equal(llm().id, "offline");
    assert.equal(describeLlm().usingOfflineFallback, true);
  });

  it("auto-selects the first vendor that has a key", () => {
    clearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(firstConfiguredProvider(), "openai");
    assert.equal(llm().id, "openai");
    assert.equal(describeLlm().usingOfflineFallback, false);
  });

  it("prefers Anthropic when several keys are present", () => {
    clearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "g-test";
    process.env.ANTHROPIC_API_KEY = "a-test";
    assert.equal(firstConfiguredProvider(), "anthropic");
  });

  it("honours an explicit provider", () => {
    clearEnv();
    process.env.ANTHROPIC_API_KEY = "a-test";
    process.env.GEMINI_API_KEY = "g-test";
    process.env.WASABI_LLM_PROVIDER = "gemini";
    assert.equal(llm().id, "gemini");
  });

  it("treats a whitespace-only key as absent", () => {
    clearEnv();
    process.env.OPENCODE_API_KEY = "   ";
    assert.equal(firstConfiguredProvider(), null);
  });

  it("fails loudly when an explicit provider has no key", () => {
    clearEnv();
    process.env.WASABI_LLM_PROVIDER = "openai";
    assert.throws(() => llm(), /OPENAI_API_KEY is not set/);
  });

  it("rejects an unknown provider name rather than silently going offline", () => {
    clearEnv();
    process.env.WASABI_LLM_PROVIDER = "llama";
    assert.throws(() => llm(), /not a known provider/);
  });

  it("reports which keys are present without leaking their values", () => {
    clearEnv();
    process.env.OPENCODE_API_KEY = "sk-secret-value";
    const status = describeLlm();
    const opencode = status.configuredKeys.find((k) => k.id === "opencode");
    assert.equal(opencode?.present, true);
    assert.equal(JSON.stringify(status).includes("sk-secret-value"), false);
  });
});

describe("model resolution", () => {
  it("uses each provider's own default per tier", () => {
    clearEnv();
    assert.equal(resolveModel("anthropic", "high"), "claude-opus-5");
    assert.equal(resolveModel("openai", "high"), "gpt-5.6-sol");
    assert.equal(resolveModel("gemini", "mid"), "gemini-3.6-flash");
  });

  it("lets a provider-specific override beat the generic one", () => {
    clearEnv();
    process.env.MODEL_HIGH = "generic-model";
    process.env.OPENAI_MODEL_HIGH = "openai-model";
    assert.equal(resolveModel("openai", "high"), "openai-model");
    assert.equal(resolveModel("gemini", "high"), "generic-model");
  });
});

describe("toGeminiSchema", () => {
  it("drops additionalProperties, which Gemini rejects", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    });
    assert.equal("additionalProperties" in out, false);
    assert.deepEqual(out.required, ["a"]);
  });

  it("converts a nullable union type to Gemini's nullable flag", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { score: { type: ["integer", "null"] } },
    }) as { properties: Record<string, Record<string, unknown>> };
    assert.equal(out.properties.score.type, "integer");
    assert.equal(out.properties.score.nullable, true);
  });

  it("recurses into nested objects and array items", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" } },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    }) as { properties: { issues: { items: Record<string, unknown> } } };
    assert.equal("additionalProperties" in out.properties.issues.items, false);
  });

  it("pins property order so responses are stable across runs", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { b: { type: "string" }, a: { type: "string" } },
    });
    assert.deepEqual(out.propertyOrdering, ["b", "a"]);
  });
});

describe("parseJson", () => {
  it("parses a bare object", () => {
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  });

  it("strips a markdown code fence, which loose JSON mode often adds", () => {
    assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  });

  it("extracts the object when the model wraps it in prose", () => {
    assert.deepEqual(parseJson('Sure! Here it is:\n{"a":1}\nHope that helps.'), { a: 1 });
  });

  it("is not confused by braces inside strings", () => {
    assert.deepEqual(parseJson('prefix {"a":"}{"} suffix'), { a: "}{" });
  });

  it("throws a typed error on truncated JSON rather than returning junk", () => {
    assert.throws(() => parseJson('{"a":'), LlmError);
  });

  it("throws when there is no JSON at all", () => {
    assert.throws(() => parseJson("I cannot help with that."), LlmError);
  });
});
