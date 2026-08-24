# Architecture Decision Records

Why the system is the way it is. One decision per file, numbered, never edited after acceptance:
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
| [0019](0019-the-rota-scopes-the-front-of-house-role.md) | The rota scopes the front-of-house role | Accepted |
| [0020](0020-backstage-joins-by-a-nightly-code.md) | Backstage joins by a nightly code, not an account | Accepted |
| [0021](0021-show-night-comms-poll-rather-than-hold-a-socket.md) | Show-night comms poll; they do not hold a socket | Accepted |
| [0022](0022-access-needs-are-special-category-data.md) | Access needs are special category data, visible only to the people working that night | Accepted |
| [0023](0023-money-taken-is-recorded-as-a-transaction.md) | Money taken is recorded as a transaction; collection remains the boundary | Accepted |
| [0024](0024-sumup-stays-a-manual-reader.md) | SumUp stays a manual reader; the till records, it does not charge | Accepted |
| [0025](0025-every-user-reference-joins-the-estate-hooks.md) | Every user-referencing column joins the estate hooks, checked in CI | Accepted |
| [0026](0026-eligibility-is-read-from-rehearsal-behind-one-seam.md) | Eligibility is read from rehearsal, behind one seam, failing open with a flag | Accepted |
| [0027](0027-the-refusals-register-is-append-only.md) | The refusals register is append-only, enforced by the database | Accepted |
| [0028](0028-a-pass-request-is-not-a-pass.md) | A pass request is not a pass | Accepted |
| [0029](0029-external-is-a-venue-not-a-strand.md) | "External" is a venue, not a strand | Accepted |
| [0030](0030-a-tab-is-a-sale-on-credit.md) | A tab is a sale on credit; settlement is its own card transaction | Accepted |
| [0031](0031-a-tab-charge-is-the-only-voidable-transaction.md) | The tab charge is the only voidable transaction | Accepted |
| [0032](0032-training-mode-writes-to-its-own-table.md) | Training mode writes to its own table and nothing else | Accepted |
| [0033](0033-the-practice-window-fails-closed.md) | The practice window fails closed | Accepted |
| [0034](0034-an-open-sandbox-closes-only-on-a-definitive-answer.md) | An open sandbox closes only on a definitive answer | Accepted |
| [0035](0035-stock-is-counted-in-real-units.md) | Stock is counted in real units, not in thousandths of a container | Accepted |
| [0036](0036-a-sold-product-is-a-recipe.md) | A sold product is a recipe over the things we stock | Accepted |
| [0037](0037-a-table-rebuild-takes-its-dependents-with-it.md) | A generated table rebuild takes its dependents with it | Accepted |

## Template

```md
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded by ADR-MMMM · **Date:** YYYY-MM-DD · **Deciders:** …

## Context

## Decision

## Alternatives considered

## Consequences
```
