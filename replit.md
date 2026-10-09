# StudyBuddy

An accessible personal teaching assistant that teaches, practises, and examines students using only the PDFs in their selected classroom.

The public product name is StudyBuddy. Existing package names and classroom URLs are intentionally unchanged to preserve saved classrooms.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server using its managed `PORT`
- `pnpm --filter @workspace/grounded-tutor run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Web: React + Vite + Wouter; generated React Query hooks
- Auth: Replit-managed Clerk; private PDF files in App Storage
- AI: Gemini vision through Replit AI Integrations
- Build: esbuild (ESM bundle)

## Where things live

- `lib/api-spec/openapi.yaml` is the API source of truth; regenerate clients instead of editing them.
- `lib/db/src/schema/tutor.ts` contains student/classroom/attempt metadata.
- `artifacts/api-server/src/lib/tutor-ai.ts` handles page mapping, grounding, tutoring, and grading.
- `artifacts/grounded-tutor/src/pages/` contains the learning screens.

## Architecture decisions

- The user selected Gemini vision instead of supplying a direct Anthropic key. Render every PDF page and combine visual analysis with the native text layer; don't reduce ingestion to text extraction alone.
- The knowledge boundary is one classroom's full Source Map. Never add web search, other classroom documents, or student interests as factual material.
- Show original PDF pages for diagrams and tables. AI-generated replacement figures are not acceptable.
- Coverage gaps are explicit and block tutoring until the classroom has verified sources.
- Preferences can change how an explanation is presented, not what the documents say.

## Product

- Learning-preference onboarding and settings
- Private, fixed-document classrooms (25 MB and 100 pages maximum per PDF)
- Teaching with diagnostics and explain-back, Practice Arena with tracked hints, adaptive examinations
- Verified citations and explicit out-of-scope abstention
- Six-axis progress radar, concept mastery, and spaced review reminders
- Keyboard-first controls, readable typography, large text, high contrast, reduced motion

## User preferences

Keep it simple, professional, and classy. Accessibility is required.

## Gotchas

- Social sign-in providers, including Google, are enabled in the workspace Auth pane for Development and Production separately.
- PDF analysis uses persistent page jobs and a database session lock for a single active worker. Apply DB schema changes before starting the updated API. Successful pages are retained; failed pages can be retried in classroom coverage.
- Gemini 3.1 Pro handles PDF mapping and grounded tutoring. Responses use explicit JSON schemas; citation verification still checks quotes against the Source Map. Rate-limited page jobs pause the queue before retrying.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
