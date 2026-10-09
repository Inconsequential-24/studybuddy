---
name: Signed-in browser testing
description: Limits of Clerk claims overrides when reusing test-runner authentication.
---
Programmatic Clerk login with overridden claims in the testing runner is not
necessarily a transferable Clerk session. Verify authentication in a fresh
context before relying on exported storage state for a separate Playwright run.

**Why:** The original runner browser authenticated successfully, but both a
spawned Playwright browser and a fresh runner context loaded with its exported
storage state received 401. Intercepting a request with `route.fetch` also lost
the runner's authentication, while allowing the original request through worked.

**How to apply:** Execute protected-page assertions in the authenticated runner
context when using claims overrides. Delay the original request rather than
reissuing it through `route.fetch` to observe pending controls. Standalone
storage-state tests require a genuine reusable Clerk session, not merely
exported state from a claims-overridden context.
