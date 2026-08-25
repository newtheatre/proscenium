# ADR-0041: A fail-open eligibility answer is cached too, briefly

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

Refines [ADR-0026](0026-eligibility-is-read-from-rehearsal-behind-one-seam.md), which stands.

## Context

ADR-0026 chose the failure direction for `isEligible()` and wrote the table that governs it. Two of
its rows are about an outage: "API unreachable, cached answer exists: **use the cached answer, do
not retry-hammer**", and "API unreachable, no cached answer: allow the claim, mark it for
FOH-manager confirmation".

The seam only ever wrote to the cache on success. Both failure paths returned an answer without
storing it, and the stale-entry path returned the old answer without re-stamping it, so once an
entry passed its five-minute TTL it stopped suppressing anything. Neither outage row was therefore
implemented: a caller with no fresh answer re-asked a dead service on **every single call**.

`GET /api/shifts/mine` asks three questions, one per shift role, and each `$fetch` carries a four
second timeout. It asked them in sequence, and ofetch retries a GET once by default while counting
a network error as a 500, so a hard-down rehearsal cost six requests and roughly twelve seconds per
page load. `/account/shifts` awaits that call at the top level, so SSR blocked on it: every member
opening the rota during a training outage stared at nothing for twelve seconds, and each of them
fired six more requests at a service that was already having a bad day. A training outage became a
proscenium outage on the one page the rota depends on, which is precisely the retry-hammer ADR-0026
named and forbade.

## Decision

**A fail-open answer is written to the cache, under a short TTL of its own.** Both outage paths now
store what they return: a re-served stale answer is re-stamped, and the no-cache fail-open answer
(`eligible: true, needsReview: true`) is stored as it stands, `needsReview` included, so the
FOH-manager confirmation list still fills.

The TTL is **45 seconds**, deliberately far below the five minutes a real answer gets. It is long
enough that a burst of page loads during an outage is answered locally, and short enough that
recovery is picked up within a minute rather than five. A cache entry therefore carries its own
lifetime rather than sharing one constant.

**`retry: 0` on the call.** ofetch's default of one retry for a GET doubles the load aimed at a
service that is already down, and buys nothing: the retry inherits an already-aborted signal on the
timeout path and fails immediately.

**The three role questions are asked together.** An outage costs one timeout, not three.

None of this changes the failure *direction*, which is the part ADR-0026 decided and which remains
untouched: an unreachable rehearsal still allows the claim and flags it. What changes is that "do
not retry-hammer" is now enforced rather than assumed.

## Alternatives considered

- **Cache only the stale re-stamp, not the no-cache answer.** Leaves the worst case untouched: a
  member who has never had a successful answer is exactly the member an outage hits hardest, and
  they are the common case on a cold isolate.
- **Give the fail-open answer the full five-minute TTL.** Simpler, and it suppresses more requests.
  Rejected because it also means a member is told for five minutes that a service which came back
  thirty seconds ago is still down, on a page they are actively refreshing.
- **A circuit breaker across all rules.** The right shape at a larger scale. Overbuilt for three
  keys and a per-isolate map; the short TTL is a per-key breaker with no extra state.
- **Fail closed during an outage instead.** Rejected in ADR-0026 on the balance of harms, and
  nothing here revisits that.

## Consequences

- A member claiming a shift within 45 seconds of rehearsal recovering may still be answered from the
  outage cache. The claim is a promise to turn up, not a grant of authority, so an extra flagged row
  is the whole cost.
- The cache is still per-isolate and still invisible outside this file, so the failure direction
  must go on being **tested by killing the URL locally**, as ADR-0026 already requires. An untested
  fallback is decoration, and this one now has two TTLs to get wrong.
- `clearEligibilityCache()` remains the only seam into it, and clears both kinds of entry.
