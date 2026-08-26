# 0001: One system, one database

- Status: Accepted
- Date: 2026-08-26

## Context

The estate is four applications (stage-door, proscenium, rooms, rehearsal) joined by a sealed
session cookie, mirror tables, service tokens and GDPR hooks. The 2026 audit showed that a large
share of each repository's most careful engineering exists only to manage the seams: mirror
upserts guarded against erasure, role staleness windows, hook retry semantics, fail-open
eligibility caches, and four divergent notification systems.

## Decision

Build one application on one database. Every module (identity, ticketing, show night, bar,
rooms, training, finance) reads and writes the same schema. The cross-app session contract, the
auth-types package, mirrors, manifests, service tokens and inter-app hooks are all retired.

## Consequences

- Erasure, export, merge and last-activity become single-transaction operations.
- Authority checks (a shift, a training record) are joins, not API calls; the fail-open seam
  and its caches disappear.
- One database is one blast radius: backups, restore drills and the offline tolerance of
  show-night screens (ADR 0016 consequences, backlog module K) bound the damage.
- A future external consumer of training data would need a deliberate public API; none is
  planned.
