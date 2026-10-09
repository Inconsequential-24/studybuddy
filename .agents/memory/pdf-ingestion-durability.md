---
name: PDF ingestion durability
description: Retry and cancellation boundaries for page-level paid PDF analysis.
---
Only verified pages count toward readiness. Retrying failed pages must preserve successful source evidence and concept identity; deletion must cancel work before storage cleanup.

**Why:** The product requires complete text, figure, and table coverage before tutoring, and model calls cost money. Restart recovery must not repeat committed page analyses.

**How to apply:** Preserve successful page results across retry cycles and verify citations without weakening evidence checks. A killed in-flight request may have been billed before its result was committed; no local database transaction can guarantee exactly-once billing by an external model provider.
