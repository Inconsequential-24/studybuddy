---
name: Learning generation concurrency
description: Protect persisted question identity and learning progress across overlapping AI-backed requests.
---
AI-backed cache generation must return the authoritative persisted result, not merely each request's generated snapshot. Do not overwrite newer classroom state after a long model call.

**Why:** An aborted browser request continued generating questions on the server while another request generated a different set. A later write replaced the persisted IDs, so the learner's displayed question was rejected as not belonging to the classroom.

**How to apply:** Share in-flight generation within a process, then transactionally lock and re-read state before committing the cache. If another request already committed a result, return that result to both callers. Preserve other learning-state fields.

Recover transient browser connection failures through bounded read-query retries, not blanket fetch or mutation retries.

**Why:** A lost response does not mean the server failed to commit an answer, upload, or deletion. Automatically replaying those actions can duplicate work or alter learning progress.

**How to apply:** Keep mutation retries disabled, distinguish network failures from source-verification errors, and allow failed reads to recover after a brief server restart.
