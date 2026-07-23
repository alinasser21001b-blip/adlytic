# Semantic Knowledge Search (pgvector) — Spec

> Status: proposed (deferred until post-launch). Upgrades `lookup_knowledge`
> (T7) from keyword overlap to embeddings-based retrieval.
> Not built blind: it needs an embeddings provider + `pgvector` + live eval,
> so this is the plan, not untested code.

## Why

`src/services/agent/tools/lookupKnowledge.ts` today scores docs by **Jaccard
token overlap** (`SIMILARITY_FLOOR = 0.15`). Its own header says "upgrade to
embeddings-based RAG in Phase 2.5." Keyword overlap misses paraphrases and
Arabic↔English synonymy (a user asking about "ضعف التفاعل" won't match a doc
titled "low CTR"). Embeddings fix that.

## Constraint that makes this "deferred, not now"

**Anthropic has no embeddings API.** We need a provider:
- **Voyage AI** (`voyage-3`, or `voyage-multilingual-2` for AR/EN) — Anthropic's
  recommended embeddings partner. Best fit for the bilingual knowledge base.
- or **OpenAI** `text-embedding-3-small` (1536-dim, cheap).

Picking + wiring a provider key, enabling `pgvector` on the managed Postgres,
and evaluating retrieval quality against real queries is a few days of work with
a live DB — not something to ship 5 days before launch on an unreachable sandbox.

## Design (keeps the tool contract stable)

1. **DB**: `CREATE EXTENSION IF NOT EXISTS vector;` then add
   `embedding vector(1024)` to the knowledge table (dim = provider's).
   Index: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`
2. **Offline embed job** (`src/workers/embedKnowledge.ts`): for each knowledge
   row with `embedding IS NULL`, call the provider on
   `title + "\n" + body`, store the vector. Idempotent; re-runs only fill gaps.
   Runs in the **worker service** (Phase A), never the API.
3. **Query time** (`lookupKnowledge.ts`): embed the query once, then
   `ORDER BY embedding <=> $queryVec LIMIT k`. Convert cosine distance → the
   existing `similarity` field so the **tool's return shape is unchanged**
   (`{ id, title, similarity, ... }`) — no caller changes.
4. **Hybrid + fallback**: keep the Jaccard scorer as a fallback when
   (a) no embeddings provider key is set, or (b) a row has no embedding yet, or
   (c) the provider call fails. Optionally blend: `0.7·cosine + 0.3·jaccard`.
   Gate the whole path behind `SEMANTIC_SEARCH_ENABLED` (default off) so it's a
   zero-risk rollout, exactly like `BULLMQ_ENABLED`.

## Rollout
1. Add `pgvector` migration + `embedding` column (nullable).
2. Add provider client + `SEMANTIC_SEARCH_ENABLED` flag (off).
3. Backfill embeddings via the worker job.
4. Flip the flag in staging; eval top-k on ~30 real AR/EN queries vs. keyword.
5. Enable in prod once recall beats the keyword baseline.

## Effort / risk
~2–3 days with a live DB + provider key. Risk low (flag-gated, keyword
fallback). **Do after launch.**
