# Architecture Decision Records

Why the system is the way it is. One decision per file, numbered, never edited after acceptance —
supersede instead. Same template as the `newtheatre/stage-door` and `newtheatre/rehearsal` repos
(reproduced below).

Write one when a decision would otherwise have to be reverse-engineered: a schema shape, a choice
between libraries, a deliberate limitation, a trap that cost someone an evening. Do not write one for
routine implementation.

**Rationale belongs here, not in code comments.** A comment states the constraint and points at the
ADR; the ADR carries the reasoning and the history. See [CONTRIBUTING.md](../../CONTRIBUTING.md)
§Comments.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-passes-as-first-class-entities.md) | Passes are first-class entities that issue ordinary tickets | Accepted |
| [0003](0003-legacy-ticketing-import.md) | Import the legacy ticketing data, with an archive layer and a retention line | Accepted |
| [0004](0004-content-warning-model.md) | Model content warnings as kind + level, and reseed the vocabulary | Accepted |
| [0005](0005-paginate-list-endpoints-in-sql.md) | Paginate list endpoints in SQL and return an envelope | Accepted |
| [0006](0006-d1-bound-parameter-limit.md) | Scope subqueries, never bind id lists | Accepted |
| [0007](0007-one-seat-counting-rule.md) | One definition of an occupied seat | Accepted |
| [0008](0008-roles-go-stale-identity-does-not.md) | Roles go stale; identity does not | Accepted |
| [0009](0009-signed-booking-access-tokens.md) | Guest booking access uses a signed token, not the booking reference | Accepted |
| [0010](0010-archive-never-delete-referenced-records.md) | Retire referenced records by archiving, never by deleting | Accepted |
| [0011](0011-collection-is-the-payment-boundary.md) | Collection is the payment boundary | Accepted |
| [0012](0012-admin-table-conventions.md) | Admin tables share one theme and never mutate pagination state | Accepted |
| [0013](0013-admin-pages-fetch-on-the-server.md) | Admin pages fetch on the server, with `useRequestFetch()` | Accepted |
| [0014](0014-anonymise-never-delete.md) | Erasure is anonymisation, and an erased account is never resurrected | Accepted |
| [0015](0015-rate-limits-declared-in-middleware.md) | Rate limits are declared centrally, in middleware, backed by D1 | Accepted |
| [0016](0016-hydrate-secrets-before-any-session-read.md) | Hydrate Secrets Store values before any session read | Accepted |
| [0017](0017-edit-from-the-full-record.md) | Edit from the full record, on the page, not from a list row in a modal | Accepted |
| [0018](0018-box-office-is-forward-looking.md) | The box office screen is forward-looking only | Accepted |

## Template

```md
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded by ADR-MMMM · **Date:** YYYY-MM-DD · **Deciders:** …

## Context

## Decision

## Alternatives considered

## Consequences
```
