# StudyBuddy codebase map

Last verified: 2026-10-09 against commit 56e7cf5 (working tree)

PDF-grounded AI tutor. pnpm monorepo: Express 5 API, React/Vite web app, Postgres via Drizzle, Gemini for vision and tutoring, Clerk for auth. Exported from Replit. Product context: [replit.md](../replit.md).

Skipped: `node_modules`, `dist`, `*.tsbuildinfo`, `pnpm-lock.yaml`.

## 1. Root

| Path | Purpose |
|---|---|
| [package.json](../package.json) | Workspace root. Scripts: `build` (typecheck then build all), `typecheck`, `typecheck:libs` (`tsc --build`). `preinstall` forces pnpm. |
| [pnpm-workspace.yaml](../pnpm-workspace.yaml) | Workspace globs (`artifacts/*`, `lib/*`, `scripts`), a shared version `catalog`, `minimumReleaseAge`, and many `overrides` that drop non-host native binaries. |
| [tsconfig.base.json](../tsconfig.base.json), [tsconfig.json](../tsconfig.json) | Shared compiler options. The root file holds project references to the four `lib/*` packages only. |
| [.env.example](../.env.example) | Template for local env (names only, see section 7). `.env` is git-ignored and was not read. |
| [scripts/dev-local.sh](../scripts/dev-local.sh) | Local runner: sources `.env`, runs `db push`, starts API on `$API_PORT` in the background, then the web app on `$WEB_PORT` with `BASE_PATH=/`. |
| [scripts/post-merge.sh](../scripts/post-merge.sh) | Replit post-merge hook: `pnpm install --frozen-lockfile`, codegen, `pnpm --filter db push`. |
| [scripts/](../scripts) (package) | Workspace package with a placeholder [src/hello.ts](../scripts/src/hello.ts). Nothing else. |
| [.replitignore](../.replitignore) | Deploy-image ignore list (only `.local`). |
| [replit.md](../replit.md) | Run commands, stack, architecture rules (grounding, no web search), gotchas. |

## 2. artifacts/api-server (`@workspace/api-server`, Express 5, port 8080 on Replit)

| Path | Purpose |
|---|---|
| [src/index.ts](../artifacts/api-server/src/index.ts) | Reads `PORT` (required), listens ([L19](../artifacts/api-server/src/index.ts#L19)), then calls `startIngestionWorker()` ([L26](../artifacts/api-server/src/index.ts#L26)). |
| [src/app.ts](../artifacts/api-server/src/app.ts) | Middleware order: pino-http, Clerk proxy at `/api/__clerk` ([L31](../artifacts/api-server/src/app.ts#L31)), CORS, body parsers, `clerkMiddleware` ([L35-37](../artifacts/api-server/src/app.ts#L35-L37)), `/api` router ([L39](../artifacts/api-server/src/app.ts#L39)), error handler ([L40-44](../artifacts/api-server/src/app.ts#L40-L44)). |
| [src/routes/index.ts](../artifacts/api-server/src/routes/index.ts) | Mounts `health` and `tutor` routers. |
| [src/routes/health.ts](../artifacts/api-server/src/routes/health.ts) | `GET /api/healthz`. |
| [src/routes/tutor.ts](../artifacts/api-server/src/routes/tutor.ts) | All product endpoints (336 lines). Auth guard via Clerk `getAuth` sets `res.locals.userId` ([L18-22](../artifacts/api-server/src/routes/tutor.ts#L18-L22)). Endpoint list below. |
| [src/lib/tutor-ai.ts](../artifacts/api-server/src/lib/tutor-ai.ts) | Gemini calls. `jsonCall` ([L30](../artifacts/api-server/src/lib/tutor-ai.ts#L30), model `gemini-3.1-pro-preview` at L33); `loadPdf` L20; `validateReferences` L44 (citation quote check); `verifiedPageConcepts` L100; `mapPdfPage` L122 / `mapPdf` L129 (render page, analyze, build Source Map); `ask` L214; `lesson` L224; `practice` L229; `grade` L236. |
| [src/lib/tutor-ingestion.ts](../artifacts/api-server/src/lib/tutor-ingestion.ts) | Persistent per-page job queue. `pageJobs` L21, `retryFailedPages` L70, `cancelClassroomAnalysis` L80, `runIngestionPass` L110 (DB advisory lock `WORKER_LOCK` L16, `MAX_ATTEMPTS = 3` L13), `startIngestionWorker` L227 (polls every 2 s). |
| [src/lib/tutor-types.ts](../artifacts/api-server/src/lib/tutor-types.ts) | Plain TS types: `Ref`, `Concept`, `SourcePage`, `Room`, `Profile`, `Question`, `Grade`, `PageFailure`. |
| [src/lib/objectStorage.ts](../artifacts/api-server/src/lib/objectStorage.ts) | `ObjectStorageService` ([L41](../artifacts/api-server/src/lib/objectStorage.ts#L41)) over Google Cloud Storage with Replit sidecar credentials (`127.0.0.1:1106`). With `STORAGE_DRIVER=local` it delegates to `localObjectStorage.ts` instead. |
| [src/lib/localObjectStorage.ts](../artifacts/api-server/src/lib/localObjectStorage.ts) | Local-disk storage for development: `resolveLocalPath` (UUID-only ids, no path escape), `LocalStoredObject` (GCS-`File`-like subset), `writeLocalUpload` (25 MB streaming cap, write-once). Tests: `tests/local-object-storage.test.ts` (`pnpm --filter @workspace/api-server run test:storage`). |
| [src/lib/objectAcl.ts](../artifacts/api-server/src/lib/objectAcl.ts) | Object ACL metadata (`setObjectAclPolicy` L70, `getObjectAclPolicy` L86, `canAccessObject` L97). |
| [src/lib/logger.ts](../artifacts/api-server/src/lib/logger.ts) | pino logger (`LOG_LEVEL`). |
| [src/lib/tutor-ai.test.ts](../artifacts/api-server/src/lib/tutor-ai.test.ts) | Unit test next to the source. |
| [src/middlewares/clerkProxyMiddleware.ts](../artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts) | Proxies Clerk Frontend API at `CLERK_PROXY_PATH` (production only, uses `CLERK_SECRET_KEY`). |
| [build.mjs](../artifacts/api-server/build.mjs) | esbuild ESM bundle to `dist/index.mjs`, with an external list and a pino plugin. `dev` = build then start. |
| [tests/](../artifacts/api-server/tests) | `tutor-ingestion.test.ts`, `tutor-model-output.test.ts` (run with `test:ingestion`), `ingestion-child.ts` helper, `retry-browser-fixtures.ts`, and `browser/retry.spec.ts` (Playwright, needs a real Clerk session; see [tests/browser/README.md](../artifacts/api-server/tests/browser/README.md)). |
| [playwright.retry.config.ts](../artifacts/api-server/playwright.retry.config.ts) | Playwright config for the retry suite (`RETRY_*` env vars). |
| [scripts/recover-classroom.ts](../artifacts/api-server/scripts/recover-classroom.ts) | Manual maintenance: re-maps pages for a non-ready classroom given its ID (`argv[2]`). Never alters PDFs. |
| [.replit-artifact/artifact.toml](../artifacts/api-server/.replit-artifact/artifact.toml) | Replit service config (port 8080, path `/api`, prod run command). |

Endpoints in `routes/tutor.ts` (spec: [openapi.yaml](../lib/api-spec/openapi.yaml)):

| Method and path | Line |
|---|---|
| GET/PUT `/profile` | [55](../artifacts/api-server/src/routes/tutor.ts#L55), [56](../artifacts/api-server/src/routes/tutor.ts#L56) |
| GET/POST `/classrooms` (POST validates ownership, 25 MB, 100 pages, `%PDF-`, creates jobs) | [64](../artifacts/api-server/src/routes/tutor.ts#L64), [72-101](../artifacts/api-server/src/routes/tutor.ts#L72-L101) |
| POST `/classrooms/:id/retry-failed-pages`, `/verify-pages` | [103](../artifacts/api-server/src/routes/tutor.ts#L103), [114](../artifacts/api-server/src/routes/tutor.ts#L114) |
| GET/DELETE `/classrooms/:id` | [110](../artifacts/api-server/src/routes/tutor.ts#L110), [151](../artifacts/api-server/src/routes/tutor.ts#L151) |
| GET `/plan`, `/dashboard`; POST `/questions` | [164](../artifacts/api-server/src/routes/tutor.ts#L164), [172](../artifacts/api-server/src/routes/tutor.ts#L172), [183](../artifacts/api-server/src/routes/tutor.ts#L183) |
| Lessons: GET, `/diagnostic`, `/explain-back` | [189](../artifacts/api-server/src/routes/tutor.ts#L189), [201](../artifacts/api-server/src/routes/tutor.ts#L201), [218](../artifacts/api-server/src/routes/tutor.ts#L218) |
| Practice: GET `/practice`, POST `/attempts` | [231](../artifacts/api-server/src/routes/tutor.ts#L231), [257](../artifacts/api-server/src/routes/tutor.ts#L257) |
| Exam: POST `/exam/start`, `/exam/:examId/answers` | [275](../artifacts/api-server/src/routes/tutor.ts#L275), [287](../artifacts/api-server/src/routes/tutor.ts#L287) |
| POST `/storage/uploads/request-url`, GET `/storage/objects/*path` (owner-checked PDF stream) | [319](../artifacts/api-server/src/routes/tutor.ts#L319), [326](../artifacts/api-server/src/routes/tutor.ts#L326) |

## 3. artifacts/grounded-tutor (`@workspace/grounded-tutor`, React + Vite + Wouter)

| Path | Purpose |
|---|---|
| [src/main.tsx](../artifacts/grounded-tutor/src/main.tsx), [src/App.tsx](../artifacts/grounded-tutor/src/App.tsx) | Entry; Clerk provider, React Query, route table ([L148-160](../artifacts/grounded-tutor/src/App.tsx#L148-L160)), `protectedRoute` ([L107](../artifacts/grounded-tutor/src/App.tsx#L107)) which redirects to onboarding when no profile. |
| [src/pages/](../artifacts/grounded-tutor/src/pages) | `landing`, `auth` (sign-in/up), `onboarding`, `settings`, `classrooms` (list), `classroom-new` (upload), `classroom-overview` (coverage, retry), `teach` (`/classrooms/:id/teach`), `practice`, `exam`, `dashboard` (six-axis radar, mastery, reviews), `not-found`. |
| [src/components/](../artifacts/grounded-tutor/src/components) | `shell.tsx` (layout/nav), `pdf-page-viewer.tsx` (shows original PDF pages for citations), `profile-form.tsx`, `bits.tsx` (small shared pieces), `error-boundary.tsx`. |
| `src/components/ui/` | 14 shadcn/Radix primitives in use (unused ones removed) (generated by [components.json](../artifacts/grounded-tutor/components.json); treat as vendored). |
| [src/lib/a11y.tsx](../artifacts/grounded-tutor/src/lib/a11y.tsx) | Display settings (large text, high contrast, reduced motion) in localStorage. |
| [src/lib/connection.ts](../artifacts/grounded-tutor/src/lib/connection.ts) | `isConnectionError`, `retryReadRequest` (reads retry, mutations never replay). Tested by [tests/connection.test.ts](../artifacts/grounded-tutor/tests/connection.test.ts). |
| [src/lib/utils.ts](../artifacts/grounded-tutor/src/lib/utils.ts), [src/hooks/](../artifacts/grounded-tutor/src/hooks) | `cn()` helper; `use-mobile`, `use-toast`. |
| [vite.config.ts](../artifacts/grounded-tutor/vite.config.ts) | Requires `PORT` and `BASE_PATH`; `@` alias to `src`; Replit plugins only when `REPL_ID` is set; optional `/api` proxy via `API_PROXY_TARGET` ([L75-77](../artifacts/grounded-tutor/vite.config.ts#L75-L77)). |
| [public/](../artifacts/grounded-tutor/public) | favicon, logo, robots.txt. |

## 5. lib/*

| Package | Purpose |
|---|---|
| [lib/api-spec](../lib/api-spec) | [openapi.yaml](../lib/api-spec/openapi.yaml) (802 lines) is the **source of truth**. [orval.config.ts](../lib/api-spec/orval.config.ts) generates two outputs. Run `pnpm --filter @workspace/api-spec run codegen`. |
| [lib/api-zod](../lib/api-zod) | **Generated, do not edit**: Zod schemas in `src/generated/api.ts` and types in `src/generated/types/`. The server parses requests with these. |
| [lib/api-client-react](../lib/api-client-react) | **Generated, do not edit**: React Query hooks in `src/generated/`. Hand-written: [custom-fetch.ts](../lib/api-client-react/src/custom-fetch.ts) (the orval mutator), `index.ts`. |
| [lib/db](../lib/db) | Drizzle + `pg` pool ([src/index.ts](../lib/db/src/index.ts), throws without `DATABASE_URL`). [drizzle.config.ts](../lib/db/drizzle.config.ts) for `push`. |
| [lib/integrations-gemini-ai](../lib/integrations-gemini-ai) | `ai` client from `AI_INTEGRATIONS_GEMINI_*` ([src/client.ts](../lib/integrations-gemini-ai/src/client.ts)); `batch/` (`batchProcess`) and `image/` helpers. |

Tables in [lib/db/src/schema/tutor.ts](../lib/db/src/schema/tutor.ts) (most store a JSONB `data` blob):

| Table | Lines | Notes |
|---|---|---|
| `tutor_profiles` | [4-7](../lib/db/src/schema/tutor.ts#L4-L7) | Learning preferences per user. |
| `tutor_classrooms` | [8-14](../lib/db/src/schema/tutor.ts#L8-L14) | `owner_id`, `data` (Room), `source_map` (SourcePage[]). |
| `tutor_uploads` | [15-19](../lib/db/src/schema/tutor.ts#L15-L19) | Object path, owner, `usedBy` marker. |
| `tutor_attempts` | [20-25](../lib/db/src/schema/tutor.ts#L20-L25) | Cascade on classroom delete. |
| `tutor_exams` | [26-30](../lib/db/src/schema/tutor.ts#L26-L30) | Exam state; cascade. |
| `tutor_page_jobs` | [33-49](../lib/db/src/schema/tutor.ts#L33-L49) | Per-page queue: status, attempts, failure, result, `next_attempt_at`; unique (classroom, page). |

## 6. Request and data flow

1. **Upload**: web asks `POST /storage/uploads/request-url`; API gets a signed URL from App Storage (or, with `STORAGE_DRIVER=local`, returns `/api/storage/uploads/local/<uuid>`) and records a `tutor_uploads` row; browser PUTs the PDF to that URL. The local PUT route in `routes/tutor.ts` checks ownership and writes to `LOCAL_STORAGE_DIR`.
2. **Create classroom**: `POST /classrooms` re-checks ownership, size, page count and PDF header, sets a private ACL, inserts the classroom (`status: processing`) and one `tutor_page_jobs` row per page in one transaction.
3. **Ingestion**: the worker (started in `index.ts`) polls every 2 s, takes a DB advisory lock, and per page renders the PDF page, combines the text layer with Gemini vision (`mapPdfPage`), verifies quotes (`validateReferences`), and projects results into `tutor_classrooms.source_map`. Failures retry up to 3 times; rate limits pause the queue; users can retry failed pages. Classroom becomes `ready` only when coverage is complete.
4. **Tutoring**: `lesson`, diagnostic, explain-back call Gemini with the whole Source Map as the only context; citations are verified before returning. `ask` answers questions or abstains.
5. **Practice and exam**: `practice` generates questions (cached; concurrent calls deduped via `practiceFlights`); `grade` scores answers; hints and attempts are saved to `tutor_attempts`; exams are adaptive and kept in `tutor_exams`.
6. **Dashboard**: `GET /dashboard` aggregates attempts into radar dimensions, mastery and review-due concepts.

## 7. Environment variable inventory (names only)

| Name | Read in | Notes |
|---|---|---|
| `DATABASE_URL` | [lib/db/src/index.ts](../lib/db/src/index.ts), [drizzle.config.ts](../lib/db/drizzle.config.ts) | Required. |
| `PORT` | api-server `index.ts`, both Vite configs | Required by each process. |
| `BASE_PATH` | grounded-tutor `vite.config.ts` | Required (use `/` locally). |
| `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL` | [lib/integrations-gemini-ai/src/client.ts](../lib/integrations-gemini-ai/src/client.ts) | Gemini access. |
| `CLERK_SECRET_KEY` | `clerkProxyMiddleware.ts`; also read implicitly by Clerk SDK | Auth. |
| `CLERK_PUBLISHABLE_KEY` | `app.ts` | Auth (server). |
| `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL` | grounded-tutor `App.tsx` | Auth (browser); proxy URL optional. |
| `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR` | `localObjectStorage.ts` | `local` = PDFs on disk (dev). Dir defaults to `<repo>/.local/storage` via `scripts/dev-local.sh`. |
| `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | `objectStorage.ts` L45, L64 | App Storage; blank in `.env.example`. |
| `API_PROXY_TARGET` | grounded-tutor `vite.config.ts` | Local `/api` proxy. |
| `LOG_LEVEL`, `NODE_ENV` | `logger.ts`, build and Vite configs | Logging and mode. |
| `REPL_ID` | both `vite.config.ts` | Enables Replit Vite plugins. |
| `RETRY_BASE_URL`, `RETRY_AUTH_STATE`, `RETRY_CHROMIUM_PATH` | `playwright.retry.config.ts` | Browser retry tests only. |
| `API_PORT`, `WEB_PORT` | `.env.example`, `scripts/dev-local.sh` only | Shell wiring, not read by app code. |

## 8. Replit-only dependencies (will not work locally as-is)

- **Clerk via Replit**: Replit-managed keys and the Clerk proxy path; locally you need your own Clerk app (`.env.example` says so).
- **App Storage**: [objectStorage.ts:13](../artifacts/api-server/src/lib/objectStorage.ts#L13) hardcodes the sidecar `http://127.0.0.1:1106` for credentials ([L19-22](../artifacts/api-server/src/lib/objectStorage.ts#L19-L22)) and signed URLs ([L253](../artifacts/api-server/src/lib/objectStorage.ts#L253)). Locally, set `STORAGE_DRIVER=local` to use the disk-backed driver instead (see `docs/plans/local-pdf-storage.md`).
- **Gemini via Replit AI Integrations**: env names are `AI_INTEGRATIONS_*`; `.env.example` points them at the public Google endpoint instead.
- Replit Vite plugins (catalog), `.replit-artifact/artifact.toml` files, `scripts/post-merge.sh`.

## 9. Replit leftovers

| Path | What it is |
|---|---|
| [.agents/](../.agents) | Agent notes ([memory/](../.agents/memory): ingestion durability, visual citations, concurrency, browser testing). Useful design history. |

## Local development modes

| Env var | Where | Effect |
|---|---|---|
| `AUTH_DRIVER=local` | [lib/localAuth.ts](../artifacts/api-server/src/lib/localAuth.ts), used in `app.ts`, `index.ts`, `routes/tutor.ts` | No Clerk: every request is user `local-user`; API binds to 127.0.0.1; refuses to start with `NODE_ENV=production`. |
| `VITE_AUTH_DRIVER=local` | [src/lib/auth.tsx](../artifacts/grounded-tutor/src/lib/auth.tsx), used in `App.tsx`, `components/shell.tsx` | Web renders without `ClerkProvider`, always signed in, sign-in/up redirect to `/classrooms`, no Sign out button. `scripts/dev-local.sh` sets it from `AUTH_DRIVER`. |
| `STORAGE_DRIVER=local` | `lib/localObjectStorage.ts` | PDFs on disk instead of Replit App Storage. |

Plans: `docs/plans/local-pdf-storage.md`, `docs/plans/local-auth-without-clerk.md`.
