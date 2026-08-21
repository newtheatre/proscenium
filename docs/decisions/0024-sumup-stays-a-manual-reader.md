# ADR-0024: SumUp stays a manual reader; the till records, it does not charge

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Every card payment the theatre takes goes through one SumUp reader, shared between the bar and
ticket sales. The Students' Union's rules fix SumUp as the payment device; the theatre cannot
replace it, and the bar module does not try.

SumUp does have an API. The temptation, once a basket exists in software, is to push the amount to
the reader so nobody types it in, and to pull the daily total back so nobody types that in either.

## Decision

**No SumUp integration of any kind.** No API calls, not even read-only "just for reconciliation". No
payment SDK, no card data, nothing that could be mistaken for handling one.

The till builds the basket, displays one figure to type into the reader, and records what was sold.
A human types the figure in, and at the end of the day a human types the Z-total back. The
reconciliation compares the two and reports *matches*, *over* or *short*.

## Alternatives considered

- **Push the amount to the reader.** Removes one typo per transaction and buys a payments
  integration: SU approval, credentials on a Worker, PCI questions that currently have the easy
  answer of "we never touch card data", and an outage mode where the bar cannot sell because our
  software cannot reach theirs. The reader works when Proscenium is down, and that property is worth
  more than the keystrokes.
- **Pull the daily total for reconciliation only.** Superficially harmless, and it quietly destroys
  the control. The reconciliation is worth something *because* two independently produced numbers
  are compared. Fetch one of them from the other system and the check becomes the software agreeing
  with itself.

## Consequences

- The typed figure is a real failure mode: someone will key £4.50 as £45.00. The reconciliation is
  where that surfaces, the same day, which is the point of doing it daily.
- The Z-total is entered per calendar day, not per performance or per session, because that is the
  granularity SumUp reports ([13-bar-design §4.5](../13-bar-design.md)).
- If the SU ever changes payment provider, this decision is unaffected. It is about the boundary,
  not about SumUp.
