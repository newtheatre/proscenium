# ADR-0032: Training mode writes to its own table and nothing else

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Someone learning the bar till, the Challenge 25 register or the door scanner currently learns them on
a real show night, standing next to somebody experienced, ringing up real money on the real till.
There is nowhere to practise. The bar module in particular is the most consequential screen a
volunteer touches: a mistake is a wrong figure typed into SumUp, a stock movement that never happened,
or a booking marked paid that was not.

So the theatre wants training modes on those three surfaces. The requirement given was blunt and is
the right one: **zero impact on regular operations.** Practice must be incapable of touching takings,
stock, the refusals register or a real booking, and it must reset afterwards.

"Incapable" is the word that decides the architecture. Every design below is *reviewable*; only one is
*checkable*.

## Decision

**Training mode never writes to an operational table.** Three mechanisms hold it, and the first is
the one that matters:

**1. Parallel routes.** Training requests go to `/api/training/**`. The real handlers
(`/api/bar/transactions`, `/api/foh/age-checks`, `/api/foh/lookup` and the rest) are **not modified**,
not by a parameter, not by a flag, not by a branch. A training request therefore cannot reach the code
that moves money, depletes stock or transitions a reservation, because it never enters it. The pure
helpers are shared and the persistence is not: `buildTransaction`, `currentPrices` and
`basketMovements` do the arithmetic in both modes, so the basket adds up identically and the figure the
trainee would type into SumUp is computed by the same function.

**2. One writable table.** A training request may write `training_runs` and `training_run_events` and
nothing else. No report, reconciliation, Z-total, GP figure or end-of-night summary reads either
table, so none of them can include practice data. That is a structural exclusion, not a `WHERE` clause
somebody has to remember to add to the next report.

**3. A default-deny middleware.** While a user has an active run, mutating `/api/bar/**` and
`/api/foh/**` requests are refused. Training mode is a modal state you enter and leave, and while you
are in it you cannot write anything real even by navigating out of it.

**The sandbox data is fictional where it needs to be and real where it helps.** Products, prices and
discounts are read from the live catalogue, so a trainee learns the actual menu at the actual prices.
Performances, bookings, customers and QR payloads come from a frozen fixture in
`shared/utils/trainingScenario.ts`. No fixture row is ever inserted anywhere. This also means practice
works on a night with no show, which is when training actually happens.

**Erasure deletes practice data rather than anonymising it.** `training_runs.user_id` is a user
reference and joins the estate hooks on the commit that creates it
([ADR-0025](0025-every-user-reference-joins-the-estate-hooks.md)), but it takes the deletion path.
[ADR-0014](0014-anonymise-never-delete.md) exists because booking and sales statistics must survive an
erasure. Practice is not a statistic, nothing aggregates it, and keeping a scrubbed shell of somebody's
till exercise serves nobody. The hooks stay idempotent, because stage-door retries them.

**Reset has three paths and one destination.** The trainee ends it; the window expires; or rehearsal
closes the window when the lead marks the register, which the next state poll notices. A daily task
purges ended and expired runs with their events.

## Alternatives considered

- **A `training_run_id` column on `transactions`, `age_checks` and `stock_movements`, filtered out of
  every read.** Rejected, and it was the tempting one because it needs no new routes. It puts fake
  money in the same table as real money and makes correctness depend on every current and future
  report remembering a filter. One forgotten `WHERE` and practice takings are in the Treasurer's
  figures. "Zero impact" cannot rest on a promise to remember.
- **A branch inside each real handler, returning before the write.** Rejected. Cheaper, but it puts
  the training path inside the money path, one early return away from a real transaction, in the
  handlers where a bug is most expensive. The parallel-route cost is duplication of orchestration, not
  of logic, and that is a price worth paying here.
- **A separate deployment or database seeded with fake data.** Rejected: a second worker, a second D1,
  a second set of secrets and a catalogue that drifts from the real menu within a term, to serve a few
  hours of practice a month.
- **No training mode; keep shadowing a real shift.** Rejected, since it is the status quo the request
  exists to replace, but it stays the fallback whenever a sandbox cannot be opened
  ([ADR-0033](0033-the-practice-window-fails-closed.md)).

## Consequences

Good: the guarantee is checkable rather than reviewable, and it is checked twice. At runtime, after a
practice session, `transactions`, `transaction_lines`, `stock_movements`, `age_checks` and
`reservations` have no new rows, and that is a step in the verification procedure rather than an
article of faith. At build time, `bun run check:training` reads every file under
`server/api/training/` and refuses any write to a table that is not `training_runs` or
`training_run_events`, and any read of a table nobody has decided about. CI runs it. Real handlers
carry no training code at all.

Bad: `/api/training/**` duplicates the orchestration of the handlers it mirrors, and a change to a
real handler's flow needs the training one considered alongside it. Mitigated by sharing every pure
helper and by the pages being the same pages, differing only in which prefix they fetch from, so a
drift shows up as a broken sandbox rather than a silently wrong one. The fixture scenario needs
maintaining as the till gains features, and a stale sandbox teaches a screen that no longer exists.
