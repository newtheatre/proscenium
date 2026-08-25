# ADR-0044: A practice run is not a substitute for the role

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`requireRun` guards every sandbox route: `/api/training/bar/tonight`, `/bar/lookup`,
`/bar/transactions`, `/foh/lookup` and `/foh/age-checks` (GET and POST). It read the session, looked
for an unexpired `training_runs` row for that surface, and stopped there. It ran no ability check.

The row is not nothing. Only `startRun` creates one, only `POST /api/training/start` calls it, and
that route opens with `await authorize(event, workFoh)` and then refuses unless
`practiceWindow(userId, target)` comes back `OPEN` ([ADR-0033](0033-the-practice-window-fails-closed.md)).
So a run row already proves that its holder held `foh.work` and that rehearsal confirmed they were
being taught this, at the moment it was minted. Reading the guard as "anyone with a session gets in"
is wrong.

What is wrong with it is the tense. The row proves something about the past and is then trusted for
as long as rehearsal's `expires_at` says, which can be hours. This estate does the opposite
everywhere else: roles are re-derived from the session on each request and a stale session loses this
app's roles rather than keeping them ([ADR-0008](0008-roles-go-stale-identity-does-not.md)). A run
row is a bearer capability that outlives the grant behind it, and the case that makes it concrete is
a volunteer stood down mid-term.

What that reaches, precisely, is worth writing down, because it is narrower than "an open sandbox"
sounds and it is still the wrong answer:

- `GET /api/training/bar/tonight` returns the **live** catalogue: `bar_products`, `bar_categories`,
  active `bar_discounts` with their percentages, and `currentPrices`, which is id, product, pence and
  effective-from. No cost, no margin, no supplier.
- The other four read the fixture in `shared/utils/trainingScenario.ts` and nothing else, so they
  carry no real customer, no real booking and no money.
- `POST /api/training/bar/transactions` and `POST /api/training/foh/age-checks` write
  `training_run_events`, which nothing else reads and the daily purge deletes
  ([ADR-0032](0032-training-mode-writes-to-its-own-table.md)).
- `server/middleware/trainingMode.ts` refuses that same person every mutating and reading path under
  `/api/bar/**` and `/api/foh/**` for as long as the run is live.

So no money moves, no operational table is written and no personal data leaks. The bar menu at the
bar's prices is on a board in the bar.

The reason to fix it anyway is the asymmetry, which is a defect on its own. The four entry points
(`start`, `end`, `state`, `available`) all authorize; the five sandbox routes did not. Take a member
holding `proscenium:FOH` who opens a `bar-till` run at 19:00 against a window expiring at 22:00, and
whose role is revoked in stage-door at 19:30. From the next session refresh,
`sessionUserForAuthorization` strips the namespaced roles, so `GET /api/training/state` and
`POST /api/training/end` both answer 403 while `GET /api/training/bar/tonight` answers 200 until
22:00. They cannot close their own sandbox and can still use it. One feature giving two answers to
one question is how a successor loses an evening.

## Decision

**`await authorize(event, workFoh)` is the first line of `requireRun`,** before the session read, in
the same order the real routes it mirrors use (`server/api/bar/tonight.get.ts`,
`server/api/foh/lookup.get.ts`).

The two checks answer different questions and both are needed. **The role decides whether there is a
sandbox at all; the run decides which one.** A revoked role closes every sandbox at once; the run's
`target_key` still keeps a till run out of the door sandbox.

`requireRun` keeps returning the user from `requireUserSession`, **not**
`sessionUserForAuthorization()`. `server/api/training/foh/lookup.get.ts` branches on `isStaff(user)`
so the sandbox shows the same two shapes the real door lookup shows, and the real one branches on the
raw session user. Resolving them differently would make the sandbox teach a screen nobody is
practising for, which is the failure [docs/14 §8](../14-training-mode-design.md) exists to prevent.

## Alternatives considered

- **Leave it: the run row already required the ability.** Rejected. It required it once. The whole of
  ADR-0008 is that this app does not carry an old answer about roles forward, and a row with hours on
  it is carrying one.
- **Re-ask `practiceWindow` on every sandbox request.** Rejected, and it is the tempting one because
  it closes the upstream case too. It puts a cross-app HTTP call on every till keystroke's lookup, and
  it fights [ADR-0034](0034-an-open-sandbox-closes-only-on-a-definitive-answer.md): an unreachable
  rehearsal must not end a run, so a per-request ask would either have to fail open (no gain) or drop
  a trainee mid-lesson on a blip. The re-ask stays where ADR-0034 put it, on the once-a-minute state
  poll.
- **Shorten the run's expiry so a revoked role lapses sooner.** Rejected: the expiry is rehearsal's
  and this app never extends or shortens a sandbox (ADR-0033). It is also the wrong lever, since it
  narrows the window rather than closing it.
- **Check the role in `server/middleware/trainingMode.ts` instead.** Rejected. That middleware exists
  to seal a run off from operational routes, and putting the sandbox's own guard somewhere other than
  the sandbox's own guard is how the next route gets added without one.

## Consequences

This introduces no new mid-lesson breakage. A stale or de-roled session already 403s the once-a-minute
`GET /api/training/state`, so `useTrainingMode().refresh()` clears the state, the banner drops and the
pinned page leaves for `/foh`. The sandbox routes now fail at the same moment rather than minutes
after the screen that fronts them, which is the point.

A de-roled member's run becomes unreachable rather than closable: `POST /api/training/end` already
refused them, and now the sandbox does too. The row is left to `expires_at` and the daily purge, which
is what those exist for.

`docs/07-api-reference.md` records the auth column for these five rows as `foh.work` + the run, rather
than the run alone. The run-only gate was written down deliberately, so a reader finding this ADR
needs to see the reversal there too.
