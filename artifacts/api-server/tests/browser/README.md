# Retry regression coverage

Run the frontend and API managed workflows first. This suite uses the real
Clerk-protected API and isolated PostgreSQL classrooms; it installs no test
endpoints or authentication bypasses.

The Replit testing runner should read `.local/skills/testing/clerk-auth.md`,
sign in programmatically as a unique test user **with login claims overridden**,
and complete that user's learning preferences. Use the existing signed-in
runner browser as described below: overridden claims are context-bound, and
exporting its cookies did not authenticate a fresh browser in verification.
Never commit cookies or tokens.

The standalone Playwright command is available for a **genuine reusable Clerk
session** exported to an ignored `.auth/` storage-state file. It is not a way to
transfer the runner's claims overrides:

```sh
RETRY_BASE_URL="https://$REPLIT_DEV_DOMAIN" \
RETRY_AUTH_STATE="/absolute/path/to/.auth/retry.json" \
pnpm --filter @workspace/api-server run test:retry-browser
```

Chromium runs headless (no X server needed). Install its browser binary with
`pnpm --filter @workspace/api-server exec playwright install chromium` if needed,
or set `RETRY_CHROMIUM_PATH` to an existing compatible Chromium executable.

The suite holds the ingestion worker's existing advisory lock while it runs,
so normal PDF analysis is briefly paused and synthetic PDFs cannot trigger paid
model calls. It cleans up only the classroom IDs it creates before releasing
the lock. If the suite is forcibly killed, stop its fixture guard process and
remove only its fixture IDs using `tests/retry-browser-fixtures.ts cleanup <id>`.
Do not run this suite concurrently with ingestion integration tests.

## Existing signed-in runner browser

The exported Clerk storage state may not authenticate a separate Playwright
process. If the runner's `signInClerkUser` session works in its existing
browser but `RETRY_AUTH_STATE` returns 401 in the spawned test process, keep
using that authenticated runner page; do not add an app auth bypass or drive
Clerk UI. The reusable assertions and real-button helper are exported from
`tests/browser/retry-runner-helper.cjs` and are also used by `retry.spec.ts`.

In `ExecutePlaywrightAction`, load that test-only helper into the runner
notebook (the injected `fs` global is available) and pass its existing `page`
and `expect`:

```js
const source = await fs.promises.readFile(
  "/home/runner/workspace/artifacts/api-server/tests/browser/retry-runner-helper.cjs",
  "utf8",
);
const loaded = { exports: {} };
new Function("module", "exports", source)(loaded, loaded.exports);
const retryRunner = loaded.exports;
```

Keep the parent-provided advisory guard alive, seed a unique room with the
fixture CLI using the current profile ID, and navigate the runner page to that
room. `retryRunner.submitRetry(page, id, sourceMap, expect)` delays the outgoing
request then uses `route.continue()` (not `route.fetch()`) so the real Clerk
authenticated POST is preserved; it asserts the disabled pending button,
HTTP 200, processing response, retained source evidence, and locked activities.
Use `retryRunner.assertProcessing`, `retryRunner.waitForStatusPoll`,
`retryRunner.assertReady`, and `retryRunner.assertAttention` around fixture
CLI `ready`/`failed` commands. Reload the page explicitly for persistence
checks. Clean every fixture ID with the fixture CLI before the parent releases
its guard. The standalone test suite still uses the normal command above when
its exported state authenticates in the spawned process.

The button sends the actual POST; the suite checks persisted queued jobs and
retained evidence. Only the analysis result is simulated with database fixture
commands. Production worker execution, process-kill recovery and retry bounds
are separately covered by `pnpm --filter @workspace/api-server run test:ingestion`
(which requires the API worker stopped).

Coverage:
- Needs-attention → pending button → processing → ready.
- Processing and ready survive reload; polling discovers completion.
- Retained source evidence and concept progress are unchanged.
- Retry HTTP errors and exhausted page-analysis retries stay visible.
- Concept, teaching, practice, exam links and questions remain locked until ready.
- Real signed-out requests return 401; other-owner and absent IDs return the
  same 404, without altering the protected classroom or its jobs.
