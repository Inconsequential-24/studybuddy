# StudyBuddy

An accessible personal teaching assistant that teaches, practises and examines students using only the PDFs in their selected classroom. Answers are grounded in the uploaded documents, with verified citations back to the original pages.

**Live site:** [juhidwivedi.online](https://juhidwivedi.online), hosted and deployed on [Replit](https://replit.com).

## Features

- Private classrooms built from your own PDFs (up to 25 MB and 100 pages each)
- Teaching with diagnostics and explain-back, a Practice Arena with tracked hints, and adaptive exams
- Verified citations, with explicit "out of scope" answers when the documents don't cover a question
- Progress radar, concept mastery and spaced review reminders
- Keyboard-first controls, large text, high contrast and reduced motion

## Tech stack

| Part | What it uses |
| --- | --- |
| Monorepo | pnpm workspaces, Node.js, TypeScript 5.9 |
| API | Express 5 (`artifacts/api-server`) |
| Web app | React 19 + Vite 7 + Wouter, React Query (`artifacts/grounded-tutor`) |
| Database | PostgreSQL + Drizzle ORM (`lib/db`) |
| API contract | OpenAPI spec + Orval codegen (`lib/api-spec`, `lib/api-zod`, `lib/api-client-react`) |
| Sign-in | Clerk, or a local no-sign-in mode for development |
| AI | Google Gemini via `@google/genai` 1.52.0 (`lib/integrations-gemini-ai`) |

## Gemini models

| Model | Exact model ID | Where it is used |
| --- | --- | --- |
| Gemini Pro | `gemini-3.1-pro-preview` | PDF page analysis, grounding, tutoring and grading ([tutor-ai.ts](artifacts/api-server/src/lib/tutor-ai.ts)) |
| Gemini Flash (image) | `gemini-2.5-flash-image` | Image helper in the Gemini integration library ([image/client.ts](lib/integrations-gemini-ai/src/image/client.ts)) |
| Gemini Flash | `gemini-2.5-flash` | Usage example in the batch helper ([batch/utils.ts](lib/integrations-gemini-ai/src/batch/utils.ts)) |

`gemini-3.1-pro-preview` needs a Gemini API key with paid quota; the free tier has no quota for it.

## Getting started

### Prerequisites

- Node.js 20+ and pnpm 10
- PostgreSQL running locally
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

Copy the example file and fill it in. `.env` is git-ignored; never commit real keys.

```bash
cp .env.example .env
```

Add your Gemini API key:

```
AI_INTEGRATIONS_GEMINI_API_KEY=your-gemini-api-key
AI_INTEGRATIONS_GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

For local development without sign-in or cloud storage:

```
DATABASE_URL=postgresql://localhost:5432/studybuddy
AUTH_DRIVER=local
STORAGE_DRIVER=local
```

To use Clerk instead, leave `AUTH_DRIVER` unset and set `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` from the [Clerk dashboard](https://dashboard.clerk.com). The Replit App Storage settings (`PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`) are only needed when running on Replit.

### 3. Create the database and run

```bash
createdb studybuddy
bash scripts/dev-local.sh
```

This pushes the database schema, starts the API on port 8080 and the web app on http://127.0.0.1:5173.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm run typecheck` | Typecheck every package |
| `PORT=5173 BASE_PATH=/ pnpm run build` | Typecheck and build every package |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas from the OpenAPI spec |
| `pnpm --filter @workspace/db run push` | Push database schema changes (dev only) |

## Project layout

```
artifacts/
  api-server/       Express API, PDF ingestion and tutoring logic
  grounded-tutor/   React web app
lib/
  api-spec/         OpenAPI source of truth
  api-zod/          Generated Zod schemas
  api-client-react/ Generated React Query hooks
  db/               Drizzle schema and client
  integrations-gemini-ai/  Gemini client and batch helpers
scripts/            Local dev script
docs/               Codebase map and design plans
```

See [docs/codebase-map.md](docs/codebase-map.md) for a file-by-file guide and [replit.md](replit.md) for product and architecture decisions.

## Credits

Co-authored by [@claude](https://github.com/claude) and [@replit](https://github.com/replit).
