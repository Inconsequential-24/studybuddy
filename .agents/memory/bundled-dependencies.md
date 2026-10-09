---
name: Bundled workspace dependencies
description: Runtime dependency resolution after shared workspace libraries are bundled into artifact services.
---
When a shared library is bundled into an artifact but an SDK remains external, the artifact itself must declare that external runtime dependency.

**Why:** A shared Gemini package worked in source-level checks, but the built API could not resolve its externalized SDK from the artifact's output directory under pnpm's strict dependency layout.

**How to apply:** For externalized packages, check resolution from the artifact's runtime location. Source-level imports and passing TypeScript checks do not prove that the bundled server can load them.
