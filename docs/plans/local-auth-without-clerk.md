# Run locally without Clerk (single local user)
Status: APPROVED (2026-10-09, by user)

## Objective
Run StudyBuddy on your Mac with no Clerk account or keys. A local mode signs everyone in as one fixed local user, while Clerk keeps working unchanged on Replit.

## Problem statement
Clerk is required in two places. The web app throws on load without `VITE_CLERK_PUBLISHABLE_KEY` (`App.tsx:43`). The API rejects every request with an invalid publishable key (`app.ts:35`), and every product route takes the user id from `getAuth(req)` (`routes/tutor.ts:20`).

## Functional requirements
- FR-01: `AUTH_DRIVER=local` (API) and `VITE_AUTH_DRIVER=local` (web) turn on local mode. Unset means Clerk, exactly as today.
- FR-02: API in local mode skips `clerkMiddleware`, and every request is treated as user `local-user`.
- FR-03: Web in local mode renders without `ClerkProvider`. The user is always "signed in": `/` goes to `/classrooms` (or onboarding), and `/sign-in` and `/sign-up` redirect to `/classrooms`.
- FR-04: The "Sign out" button is hidden in local mode, because there is no account to sign out of.
- FR-05: All existing data scoping (`owner_id` columns, upload ownership checks) keeps working, with `local-user` as the owner.

## Non-functional requirements
- NFR-01 Security: the API refuses to start if `AUTH_DRIVER=local` and `NODE_ENV=production`. In local mode the API and web dev server listen on `127.0.0.1` only, not your Wi-Fi network, so nobody else on the network can use the no-login app.
- NFR-02 Compatibility: no changes to Clerk behaviour when the flags are unset, and no new dependencies. Clerk packages stay installed.
- NFR-03 Maintainability: the Clerk/local switch in the web app lives in one small module (`src/lib/auth.tsx`) instead of being scattered.

## Edge cases
- Only one of the two flags is set. API-local with web-Clerk fails at Clerk load (no key), and web-local with API-Clerk gets 401s. `scripts/dev-local.sh` sets both from one `AUTH_DRIVER` value to avoid this.
- Data created in local mode belongs to `local-user`. It won't appear under a real Clerk account if you switch later (acceptable for local dev).

## Security and privacy
- Local mode has no authentication by design. That's why it's limited to localhost and blocked in production (NFR-01).

## Explicit non-goals
- Multiple local users, passwords, or a replacement login system.
- Removing Clerk from the codebase or package.json.

## Acceptance criteria
- AC-01 (FR-01, NFR-02): With the flags unset, typecheck passes and the Clerk code paths are byte-for-byte the same logic as before.
- AC-02 (FR-02): With `AUTH_DRIVER=local`, `GET /api/profile` returns a profile response (404 or 200) instead of 401 or 500.
- AC-03 (FR-03, FR-04): `http://localhost:5173/` loads without Clerk keys, lands on onboarding, and shows no Sign out button.
- AC-04 (NFR-01): `NODE_ENV=production AUTH_DRIVER=local` makes the API exit with a clear error.
- AC-05 (FR-05): An end-to-end run (onboarding → upload PDF → classroom analysed → teach page) works in your browser.

## Implementation plan

| Task | Objective | Reqs | Files (Verified) | Proposed implementation | Verification |
|---|---|---|---|---|---|
| T-01 | API local auth | FR-02, NFR-01 | `artifacts/api-server/src/app.ts`, `src/index.ts`, `src/routes/tutor.ts:18-23` | Add `isLocalAuth()`. Skip `clerkMiddleware`/proxy when local. Auth guard uses `"local-user"`. Production guard. Listen on `127.0.0.1` when local. | typecheck; curl `/api/profile`; production-guard check |
| T-02 | Web local auth | FR-03, FR-04, NFR-03 | new `artifacts/grounded-tutor/src/lib/auth.tsx`; `src/App.tsx` (L36-43, L74-160); `src/components/shell.tsx:63-75` | `auth.tsx` exports `LOCAL_AUTH`, `SignedIn`, `SignedOut`, `useSignOut`. App.tsx uses `Show`→`SignedIn`/`SignedOut`. ClerkProvider and cache invalidator only when not local. Sign-in/up routes redirect when local. Shell hides Sign out when `useSignOut` returns null. | typecheck; load page via curl + your browser |
| T-03 | Wiring + docs | FR-01, NFR-01 | `.env.example`, `scripts/dev-local.sh`, `docs/codebase-map.md` | `AUTH_DRIVER=local` in env. Script exports `VITE_AUTH_DRIVER` from it and passes `--host 127.0.0.1` to Vite. Docs updated. | dev-local.sh boots both servers |
| T-04 | Verify | all | — | typecheck, `test:storage`, API smoke checks (AC-02, AC-04), page load (AC-03). You do AC-05 in your browser. | tracker below |

Estimated size: ~60 changed lines plus a ~25-line new module.

## Traceability / verification tracker

| Req | Acceptance | Check | Result |
|---|---|---|---|
| FR-01, NFR-02 | AC-01 | `pnpm run typecheck`; Clerk paths only wrapped in `!isLocalAuth()` / `LOCAL_AUTH` checks | Passed |
| FR-02 | AC-02 | curl `/api/profile` → 200, `id: local-user` (direct and via web proxy) | Passed |
| FR-03, FR-04 | AC-03 | page returns 200, `VITE_AUTH_DRIVER=local` reaches the browser bundle; visual check of redirect/no Sign out | Partly (visual check by user) |
| NFR-01 | AC-04 | `NODE_ENV=production` → API throws the guard error; both servers listened on 127.0.0.1 only | Passed |
| FR-05 | AC-05 | manual E2E (you) | Not executed |
