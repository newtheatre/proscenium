# ADR-0033: The practice window fails closed

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Training mode ([ADR-0032](0032-training-mode-writes-to-its-own-table.md)) is reachable only by
someone actively being taught the surface in question. Only rehearsal knows that, and it answers
through `GET /api/v1/practice/:key`, behind the seam this app already uses for eligibility
([ADR-0026](0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)).

ADR-0026 chose **fail-open with a flag** for eligibility, deliberately and with an argument: failing
closed would mean a training outage empties the rota, and an unstaffed performance is a real harm
tonight, whereas an unqualified claim is a flagged row a human reviews. That reasoning was about shift
claims. It does not automatically carry, and this record exists so nobody assumes it does.

## Decision

**`practiceWindow()` fails closed.** No token, unreachable service, timeout, malformed answer, unknown
key: all of them mean no sandbox.

The balance of harms is the reverse of ADR-0026's. Failing closed costs a trainee an evening's
practice, and the fallback is the status quo: they shadow somebody on a real shift, which is how this
was learned until now. Failing open would hand a sandbox to whoever asked for one, at the moment the
service that decides who may have it cannot be consulted. There is no performance left unstaffed and
no customer turned away. Nothing about tonight gets worse.

**No answer is cached.** The call is made when a run starts and when it is resumed, a few times a
term, so there is nothing to save. More to the point, rehearsal serves this endpoint `no-store`
precisely because a window closes the moment a lead marks the register, and a cached true would keep a
sandbox open after the lesson ended. Caching here would defeat the reset the whole feature promises.

Both seams stay in `server/utils/eligibility.ts`, so this app still talks to rehearsal in exactly one
file, with one token and one base URL. The only thing hardcoded here is three target keys
(`bar-till`, `challenge-25`, `door-scan`); which modules they cover is rehearsal's data, so a
catalogue renumbering never touches this repo.

## Alternatives considered

- **Fail open, consistent with ADR-0026.** Rejected. Consistency of *mechanism* is worth having and we
  keep it, in one file with one shape. Consistency of *failure direction* is not a virtue in itself:
  the direction follows from what the failure costs, and here it costs almost nothing to refuse.
- **Fail open only for a user who held a window recently.** Rejected. It is fail-open with extra steps,
  and "recently" is precisely the interval a lead has just closed.
- **Cache for a short window, say thirty seconds.** Rejected. It buys nothing measurable on a call made
  twice an evening, and it reintroduces exactly the staleness rehearsal set `no-store` to prevent.
- **Let a manager grant a sandbox locally when rehearsal is down.** Rejected for v1: a second source of
  authority for the same question, and the thing it unblocks is practice, which can wait.

## Consequences

Good: an outage in training cannot produce a sandbox, and the refusal is legible ("practice is not
available at the moment"). The reset promise holds end to end, because nothing between rehearsal and
this app remembers a stale yes.

Bad: two failure directions now live in one file, so a reader must not assume the neighbouring function
behaves the same way. Both are commented at the point of divergence, citing this record and ADR-0026.
The direction must be **tested by killing the URL locally**, as ADR-0026 requires of its own: confirm
starting a run is refused while shift claims still fail open and flag for review. An untested fallback
is decoration.
