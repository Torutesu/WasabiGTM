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

Copy `.env` and set real values before doing anything beyond local work — in
particular `AUTH_SECRET` and `ANTHROPIC_API_KEY`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing key. **Replace the development value.** |
| `ANTHROPIC_API_KEY` | Enables the real model. Without it the app runs the deterministic offline provider. |
| `WASABI_LLM_PROVIDER` | `auto` (default), `anthropic`, or `offline` |
| `WASABI_MOCK_EXTERNAL` | `1` mocks every outbound integration. **Never set this in production.** |
| `MODEL_HIGH` / `MODEL_MID` / `MODEL_LIGHT` | Model per tier (see `src/lib/llm.ts`) |

## Running

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm start
```

Sign in with the seeded user (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`).

## Tests

```bash
npm run test:db:reset   # truncate + reseed the *_test database
npm run test:e2e        # Playwright, P0 suite
```

The suite runs against a production build and mocks every external service, so
it exercises application logic rather than network availability or model output.

## Checks

```bash
npm run typecheck
npm run lint
```

## Layout

```
src/
  brand.config.ts      Design tokens. Swap this file to reskin every screen.
  lib/
    llm.ts             Model tiers; Anthropic and offline providers
    llm-offline.ts     Deterministic fixtures used by the E2E suite
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
