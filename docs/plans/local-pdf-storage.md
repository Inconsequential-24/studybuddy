# Local-disk PDF storage for local development
Status: APPROVED (2026-10-09, by user)

## Objective
Let StudyBuddy create classrooms (upload, analyse, view, delete PDFs) when run locally on macOS, without Replit App Storage, while keeping Replit behaviour unchanged.

## Problem statement
`artifacts/api-server/src/lib/objectStorage.ts` talks to Google Cloud Storage through the Replit sidecar at `127.0.0.1:1106` (line 13, `signObjectURL` ~line 236). Off Replit, requesting an upload URL fails, so no classroom can be created.

## Functional requirements
- FR-01: A `STORAGE_DRIVER` env var selects `replit` (default, current behaviour) or `local`.
- FR-02: In `local` mode, `POST /api/storage/uploads/request-url` returns an upload URL on this API (`/api/storage/uploads/local/<uuid>`) and the same `objectPath` shape as today (`/objects/uploads/<uuid>`).
- FR-03: A new `PUT /api/storage/uploads/local/:id` route (local mode only) saves the raw request body to disk. It only accepts uploads whose `tutor_uploads` row is owned by the signed-in user.
- FR-04: In local mode, `getObjectEntityFile` returns an object that supports the operations the code already uses: `getMetadata()`, `download()`, `createReadStream()`, `delete({ ignoreNotFound })`.
- FR-05: Classroom creation, page ingestion, PDF viewing (`GET /api/storage/objects/*`) and classroom deletion work unchanged against local files.
- FR-06: Files are stored under `LOCAL_STORAGE_DIR` (default `<repo>/.local/storage`, which `.gitignore` already ignores).

## Non-functional requirements
- NFR-01 Security: object ids must be UUIDs, and resolved paths must stay inside the storage dir (no path traversal). The PUT is authenticated and owner-checked, and it can only write to a path issued by `request-url`, once.
- NFR-02 Limits: the PUT rejects bodies over 25 MB (26214400 bytes, matching `tutor.ts`) while streaming, without buffering the whole file in memory.
- NFR-03 Compatibility: nothing changes when `STORAGE_DRIVER` is unset. No new dependencies.
- NFR-04 Maintainability: the change is confined to the storage module and one route. The frontend (`classroom-new.tsx:53`, which PUTs to `uploadURL`) is unchanged.

## Use cases
- As a developer, I run `./scripts/dev-local.sh`, upload a PDF, and the classroom is analysed with Gemini, just as on Replit.

## Constraints
- The GCS `File` type is used in `tutor.ts` and `tutor-ingestion.ts`. A small `StoredObject` interface is introduced, and the GCS `File` satisfies it structurally.

## Edge cases
- PUT for an unknown or other user's id → 404. A repeated PUT → 409. A body over 25 MB → 413, and the partial file is removed.
- The client aborts mid-upload → the partial file is removed.
- Deleting a classroom whose file is already gone → treated as not found (existing `ignoreNotFound` path).
- The storage dir is missing → created on first write.

## Security and privacy
- Ownership is already enforced through `tutor_uploads.owner_id` on every read path (`tutor.ts` ~L78 and ~L331). Object ACL metadata (`objectAcl.ts`) has no local equivalent: in local mode `trySetObjectEntityAclPolicy` becomes a no-op, because no code path calls `canAccessObjectEntity`.
- Files are stored unencrypted on the local disk. This is for development only.

## Dependencies
- None new. Uses Node `fs` / `stream/promises`.

## Assumptions
- Local mode is for development on one machine, not for production.
- Clerk keys are configured separately. Classroom creation needs a signed-in user.

## Explicit non-goals
- An S3, MinIO or other cloud backend.
- Migrating files out of Replit App Storage.
- Changing the frontend, the OpenAPI spec, or the DB schema.

## Acceptance criteria
- AC-01 (FR-01, NFR-03): Given `STORAGE_DRIVER` is unset, the module behaves exactly as before (unchanged code path, typecheck passes).
- AC-02 (FR-02, FR-03): Given local mode and a signed-in user, when the UI uploads a PDF, then a file appears at `.local/storage/uploads/<uuid>` and the PUT returns 200.
- AC-03 (FR-05): After creating a classroom from that upload, ingestion maps pages (page_jobs complete) and the original PDF page renders in the viewer.
- AC-04 (FR-05): Deleting the classroom removes the file and its `tutor_uploads` row.
- AC-05 (NFR-01): A PUT with a non-UUID id, or the id of another user's upload, is rejected and writes nothing.
- AC-06 (NFR-02): A PUT over 25 MB returns 413 and leaves no file behind.

## Testing requirements
- Unit tests (node:test via tsx, like the existing `test:ingestion`) for the local driver: path validation, size cap, metadata/download/delete.
- `pnpm run typecheck` and the existing `test:ingestion` still pass.
- Manual end-to-end check (AC-02 to AC-04) in your browser after the Clerk keys are set. No browser automation without separate permission.

## Outstanding decisions
- None blocking. Defaults: `STORAGE_DRIVER=local` and `LOCAL_STORAGE_DIR=.local/storage` in `.env.example`.

## Implementation plan

| Task | Objective | Reqs | Files (Verified · To investigate) | Depends on | Proposed implementation | Verification | Risks | Done when |
|---|---|---|---|---|---|---|---|---|
| T-01 | Local storage driver | FR-01, FR-04, FR-06, NFR-01 | `artifacts/api-server/src/lib/objectStorage.ts` (Verified) | — | Add a `StoredObject` interface and a `LocalStoredObject` class backed by `fs`. Branch in `getObjectEntityUploadURL`, `getObjectEntityFile`, `normalizeObjectEntityPath` and `trySetObjectEntityAclPolicy` on `STORAGE_DRIVER`. Add `resolveLocalPath(id)` with UUID check and containment check. | Unit tests | Type drift vs the GCS `File` | AC-01 typecheck, unit tests pass |
| T-02 | Upload endpoint | FR-03, NFR-01, NFR-02 | `artifacts/api-server/src/routes/tutor.ts` (Verified, ~L319) | T-01 | `PUT /storage/uploads/local/:id`: 404 unless local mode. Owner check via `tutor_uploads`. Stream `req` to a temp file with a byte counter (413 over the cap), then rename atomically. Registered before `express.json`? Not needed: the body is `application/pdf`, which the JSON and urlencoded parsers ignore. | Unit test of the stream-and-cap helper. Manual upload. | Body consumed by a parser (checked: none for `application/pdf`) | AC-02, AC-05, AC-06 |
| T-03 | Swap `File` types at call sites | FR-05 | `routes/tutor.ts`, `lib/tutor-ingestion.ts:102` (Verified) | T-01 | Type-only changes where needed | `pnpm run typecheck` | — | Typecheck passes |
| T-04 | Config + docs | FR-01, FR-06 | `.env.example`, `docs/codebase-map.md` (Verified) | T-01 | Add `STORAGE_DRIVER=local` and `LOCAL_STORAGE_DIR`. Document both. | Review | — | Docs updated |
| T-05 | Verify | all | — | T-01..T-04 | Typecheck, `test:ingestion`, new unit tests, then a manual end-to-end check by you | Results table below | Needs Clerk keys for E2E | Tracker filled |

Estimated size: ~120 lines in `objectStorage.ts`, ~30 in `tutor.ts`, ~80 lines of tests.

## Traceability / verification tracker

| Req | Acceptance | Test / check | Result |
|---|---|---|---|
| FR-01, NFR-03 | AC-01 | `pnpm run typecheck`; default branch untouched when `STORAGE_DRIVER` unset | Passed |
| FR-02, FR-03 | AC-02 | manual upload | Blocked (needs Clerk keys) |
| FR-05 | AC-03, AC-04 | manual classroom create/view/delete | Blocked (needs Clerk keys) |
| NFR-01 | AC-05 | `test:storage` (invalid ids / traversal); route owner check via `tutor_uploads` (code review only) | Passed (unit) |
| NFR-02 | AC-06 | `test:storage` (413, no leftover file); route pre-checks Content-Length | Passed (unit) |
| — | regression | existing `test:ingestion` | Not executed (writes test rows to the local DB; awaiting permission) |
