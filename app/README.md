# Wasabi — Growth OS

An internal-first growth system: it reads a product's real context, generates
channel work every cycle, gates it on quality before a human ever sees it, and
measures what shipped so the next cycle is better informed.

Built from `pipeline/okara/spec/`. Build decisions and spec deviations are in
`pipeline/okara/build-notes.md`.

## Requirements

- Node 20.9+
- PostgreSQL 16

## Setup

```bash
npm install

# Databases (one for development, one for the E2E suite)
createdb wasabi && createdb wasabi_test

# Development schema + seed user
npm run db:migrate
npm run db:seed

# E2E schema
npm run test:db:migrate
```

Copy `.env.example` to `.env` and set real values before doing anything beyond
local work — in particular `AUTH_SECRET` and at least one LLM key.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing key. **Replace the development value.** |
| `WASABI_LLM_PROVIDER` | `auto` (default), `anthropic`, `openai`, `gemini`, `opencode`, `offline` |
| `WASABI_MOCK_EXTERNAL` | `1` mocks every outbound integration. **Never set this in production.** |

## LLM providers

Four vendors are supported. Set the key for whichever you use:

| Provider | Key | Endpoint | Structured output |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | default | `output_config.format` (strict) |
| OpenAI | `OPENAI_API_KEY` | default | `response_format: json_schema` (strict) |
| Gemini | `GEMINI_API_KEY` | default | `responseSchema` (schema is translated — see below) |
| OpenCode Zen | `OPENCODE_API_KEY` | `https://opencode.ai/zen/v1` | loose JSON mode, auto-upgrades to strict if the endpoint accepts it |

With `WASABI_LLM_PROVIDER=auto` the first vendor in that order that has a key is
selected. **With no key at all, `auto` falls back to the deterministic offline
provider** — the app still works, but nothing is written by a real model. The
Settings screen shows which provider is live and warns when it is the fallback.

Each provider has its own per-tier defaults. Override per tier, most specific
first: `OPENAI_MODEL_HIGH` → `MODEL_HIGH` → built-in default. Endpoints can be
redirected with `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `OPENCODE_BASE_URL`
(proxies, gateways, Azure). See `.env.example` for the full list.

Verify a key end to end — this is the only thing that exercises the real
structured-output path, since the E2E suite runs on offline fixtures:

```bash
npx tsx scripts/check-provider.ts            # the active provider
npx tsx scripts/check-provider.ts gemini     # a specific one
```

Two provider-specific notes:

- **Gemini** accepts a restricted schema dialect. `toGeminiSchema` drops
  `additionalProperties` and rewrites `type: ["integer", "null"]` to
  `nullable: true`, because Gemini rejects both. Unit-tested.
- **OpenCode Zen** fronts a mixed catalogue (Claude, GPT, Gemini, DeepSeek, …)
  behind one key, so not every model implements strict schemas. It defaults to
  loose JSON mode with the schema restated in the prompt, and upgrades itself
  once an endpoint proves it accepts `json_schema`. Force either mode with
  `OPENCODE_SCHEMA_MODE`.

## Running

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm start
```

Sign in with the seeded user (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`).

## Tests

```bash
npm run test:unit       # pure logic: provider selection, schema translation, JSON extraction
npm run test:db:reset   # truncate + reseed the *_test database
npm run test:e2e        # Playwright, P0 suite
npm test                # typecheck + lint + unit + e2e
```

The E2E suite runs against a production build and mocks every external service,
so it exercises application logic rather than network availability or model
output. It forces `WASABI_LLM_PROVIDER=offline`, so a real key on the machine
never changes a test result.

## Layout

```
src/
  brand.config.ts      Design tokens. Swap this file to reskin every screen.
  lib/
    llm/
      index.ts         Provider registry, key resolution, selection
      anthropic.ts     Anthropic
      openai-compatible.ts  OpenAI and OpenCode Zen
      gemini.ts        Gemini + its schema dialect converter
      offline.ts       Deterministic provider
      offline-fixtures.ts   Fixtures used by the E2E suite
      models.ts        Per-provider tier defaults and overrides
    context.ts         Living Context ingest + foundation documents (AIF-001/002)
    agents.ts          Channel agents (AIF-003..007)
    quality.ts         The anti-slop gate (AIF-008)
    audit.ts           SEO and GEO audits (AIF-005)
    jobs.ts            Job orchestration, retries, logging
    external.ts        Every outbound integration, with mockable boundaries
  app/
    projects/[slug]/   The screens (feed, chat, docs, site, performance, …)
    api/               Route handlers
```

## Notes

- **Reddit posting is deliberately not implemented.** The agent finds threads and
  drafts a reply; publishing is copy-and-paste by a human. Automated posting gets
  accounts shadowbanned and is the failure mode this product exists to avoid.
- **GitHub PRs are never auto-merged.** The coding agent opens a PR; a human merges.
- A draft that fails the quality gate three times is dropped rather than shown,
  and the drop is recorded on the job so it is visible rather than silent.
