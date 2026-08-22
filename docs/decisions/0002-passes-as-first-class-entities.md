# ADR-0002: Passes are first-class entities that issue ordinary tickets

**Status:** Accepted · **Date:** 2026-08-10 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The theatre wants to sell season passes for the Autumn 2026 in-house/studio season, and festival
passes for StuFF thereafter. It has sold both for a decade: the legacy Heroku system recorded 135
pass sales and 1,186 pass admissions between 2016 and 2025, but modelled neither.

In that system a pass was two prices in a singleton table and a set of integer counters on the
till transaction. There was no pass entity, no holder, no serial number, no validity window, no show
list. A pass admission was a volunteer pressing a button labelled "Season". The consequences are
still with us: no renewal list, no way to contact holders, no way to replace a lost card, and no
answer to "is this pass valid for tonight?" other than asking.

Proscenium has accounts and a per-ticket sales model, so it can do better. The question is how a
multi-performance product fits a schema where `reservations.performanceId` is NOT NULL.

## Decision

**A pass is its own entity, and redeeming it creates an ordinary `tickets` row priced at zero.**

Five new tables: `seasons`, `pass_types`, `pass_type_prices`, `pass_type_shows`, `passes`,
`pass_admissions`. A `pass_admissions` row links a pass to the ticket that admission produced,
with `UNIQUE (pass_id, performance_id)` carrying the entitlement rule.

Four supporting choices:

- **Entitlement is unlimited within scope**: one admission to every covered show, no credit
  balance. The database enforces one admission per performance.
- **Scope is an explicit list of shows**, seeded from a season and editable afterwards.
- **A pass is account-bound** to a user, real or shadow, exactly like a booking.
- **Pass revenue is recorded on the pass** (`passes.pricePaid`), not as a ticket line.

Full design in [10-passes-design](../10-passes-design.md).

## Alternatives considered

- **Passes as a ticket type with an entitlement flag**: no new tables, and it is what the legacy
  import does for historic data. Lost because a ticket type carries no holder, no scope and no
  expiry, so it can record that a pass was used but never validate one. It would reproduce exactly
  the gap that makes the 2016–2025 data unusable.
- **Passes as a reservation spanning many performances**: nullable `performanceId` on
  `reservations`, one reservation per pass. Lost because it makes a NOT NULL column nullable across
  the busiest table in the schema, breaks every capacity and door-list query, and conflates "a seat
  is held" with "a right exists".
- **A separate pass-admission ledger that does not create tickets**: a parallel seat count
  reconciled against the ticket count. Lost immediately: two sources of truth for capacity in a
  system with no transactions is how you oversell a house.
- **Scope as a stored rule (season + category) rather than a show list**: nothing to maintain, but
  cannot express "everything except that one", and cannot grant a mid-season addition to existing
  holders without changing the rule's meaning retrospectively.
- **Bearer passes with no holder**: closest to how it actually worked, no personal-data surface,
  transferable by nature. Lost because renewals and replacement of a lost pass are the two things
  the box office actually asks for, and both need identity. Revisit if a physical card is ever
  wanted: `transferable` is already on `pass_types`.

## Consequences

**Good.** Capacity, the door list, "my bookings", the sold-out badge and the treasurer's export all
keep working with no changes, because a pass admission *is* a ticket. Entitlement is enforced by a
unique index rather than application logic, which matters when D1 offers no transactions. Festival
passes need no new code: a StuFF Day Pass is a pass whose validity window is one day. The theatre
gets a renewal list for the first time.

**Bad.** Revenue now has two sources and every money query must union them; `/api/admin/stats` and
the CSV export both need changing, and multi-year comparisons must also include the legacy
`PASS_SALE` tickets. Unlimited entitlement against fixed capacity creates a genuine overselling
risk, mitigated by `maxIssued` and by stating in the terms of sale that a pass does not reserve a
seat. Guests cannot redeem, which is a deliberate consequence of account-binding.

**Deferred.** Online pass purchase is out of scope because the app has no payment integration at
all. Historic passes are not retro-fitted: no holder was ever recorded, and inventing one would be
fabricating an archive.
