# Training mode: design

**Status: agreed, not yet built.** Drafted August 2026 by Matt Adcock (ITM 26/27). Depends on the
[show night screen design](./11-show-night-screen-design.md) for the `/foh` route shell and the
QR/reference lookup, and on the [bar design](./13-bar-design.md) for the till and Challenge 25. It
also depends on `rehearsal`, which decides who may enter a sandbox: its
[scheduling and sign-ups design](https://github.com/newtheatre/rehearsal/blob/main/docs/scheduling-design.md)
§7 is the other half of this.

The architecture is [ADR-0032](./decisions/0032-training-mode-writes-to-its-own-table.md); the
failure direction is [ADR-0033](./decisions/0033-the-practice-window-fails-closed.md). This document
is what to build.

## 1. What this is

Three screens in this app are things a volunteer has to be *taught*, not merely shown: the counter
till, the Challenge 25 register and the door scanner. Today they are learned by standing next to
somebody experienced on a real show night and taking over halfway through. That is how it has always
been done, and it means every trainee's first transaction is a real one, with a real customer waiting
and a real card reader.

Training mode is a sandbox on each of those three, open only to somebody currently being taught it,
and closing when the lesson ends.

The requirement that shapes everything: **zero impact on regular operations.** Not "we filter it out
of the reports". Not "the handler returns early". Incapable. After an evening of practice, the tables
that hold money, stock, the refusals register and bookings have no new rows, and that is something a
successor can check with a query rather than take on trust.

**Not in scope:** a training mode for closing the bar (the Z-total and reconciliation are learned
once, alongside somebody, and simulating a card reader's daily total teaches nothing), for the box
office desk, or for anything in `/admin`. Scoring, marking or assessing a trainee: this app records
nothing about how the practice went, and the training record stays rehearsal's business. Any
suggestion that finishing a sandbox awards anything.

## 2. Who gets in

A person may open a sandbox when rehearsal says they are being taught it. That happens two ways, both
of which are rehearsal's business and neither of which this app can influence:

- their session lead opened the register on a session teaching a module in that sandbox's practice
  target, which covers the whole room in one tap; or
- a lead opened a window for them by hand, for coaching outside a scheduled session.

This app asks `practiceWindow(userId, target)` in `server/utils/eligibility.ts`, the same file and the
same service token as the eligibility seam, and **fails closed** on any doubt
([ADR-0033](./decisions/0033-the-practice-window-fails-closed.md)). The only thing hardcoded here is
three target keys:

| Target key | Opens |
|---|---|
| `bar-till` | The till, both tabs |
| `challenge-25` | The ID-check register |
| `door-scan` | Scan, admit, and the standing verdict |

Which modules cover each is a row in rehearsal's `practice_targets`, edited by the committee. This
repo never learns a module id, so an ADMN renumbering is not a deploy here.

**No shift and no show are required.** A sandbox is reachable on a Tuesday afternoon in a library,
which is when training actually happens. This is the one place in `/foh` where the rota does not
scope the screen ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)), and it is
consistent rather than contradictory: the rota scopes access to *tonight's real customers*, and there
are none here.

## 3. A run

```
POST /api/training/start   →  a training_runs row, expiring when rehearsal's window does
    ... practice ...
POST /api/training/end     →  ended, events deleted
```

`GET /api/training/state` is polled while a run is live. It returns whether the run is active, what
is left on the clock, and the tally of what has been done, and it re-asks the seam, so a lead marking
the register in rehearsal ends the sandbox here within a poll.

A run belongs to a person, not a device or a tab. Somebody who starts practising on their phone and
picks up the counter laptop is in the same run.

**`POST /api/training/start` asks the seam every time, resuming as well as opening**
([ADR-0033](./decisions/0033-the-practice-window-fails-closed.md)). Reopening a screen whose run is
still on the row is the common way back in, from a bookmark, the back button or the Practice tile
still on the FOH home, and a window closed since it opened must refuse there too. Only a definitive
`CLOSED` ends the run; `UNREACHABLE` resumes it untouched, because ending deletes the run's events
with it ([ADR-0034](./decisions/0034-an-open-sandbox-closes-only-on-a-definitive-answer.md)).

The client pins on the intent rather than the outcome: a page reached with `?practice=1` refuses its
fetches outright if practice is not open, instead of quietly resolving them to the live route.

### 3.1 The banner

While a run is live, every page in `/foh` carries an unmissable persistent banner: that this is
practice, nothing here is real, how long is left, and **End practice**. It is deliberately ugly. The
one genuinely dangerous state this feature can produce is a person who believes they are practising
when they are not, or the reverse, and the mitigation is that the two never look alike.

The `/foh` home shows a Practice tile per open target, so somebody being taught the till sees the
till sandbox and nothing else. With no open window there is no tile and no hint that the feature
exists.

## 4. What a trainee sees

**Real catalogue, fictional customers.**

| | Where it comes from |
|---|---|
| Products, categories, prices, discounts | The live tables, read-only. The actual menu at the actual prices. |
| Performances, shows, venues | `shared/utils/trainingScenario.ts` |
| Bookings, references, QR payloads, customer names | `shared/utils/trainingScenario.ts` |

The scenario is a frozen object in the shapes the real endpoints return. **No fixture row is ever
inserted into `performances`, `reservations`, `users` or anything else**, so there is no seeded data
to leak into a real screen, and nothing to clean up.

Its customers are obviously invented in the UI, but its booking references match the real
`^[A-Z0-9]{6}$` shape so the scanner behaves exactly as it will on the night. That is safe because
training lookups only ever search the fixture: a real reference typed into a sandbox finds nothing.

The scenario should include the cases worth rehearsing rather than a tidy happy path: an unpaid
booking to send to the counter, a paid one, a party of four, a booking already admitted, a customer
with an access symbol, and a reference that does not exist.

## 5. The three sandboxes

### 5.1 Till (`bar-till`)

Both tabs, one basket, exactly as [13 §2.1](./13-bar-design.md) describes. Tiles, quantities,
discounts, a fixture reservation pulled onto the Tickets tab, the gold figure, the tender tap.

`POST /api/training/bar/transactions` runs the same arithmetic as the real route: `currentPrices` for
the snapshot, `buildTransaction` for the total and the discount, `basketMovements` for what stock
*would* leave the shelf. Then it writes one `SALE` event and returns the real response shape. The
figure a trainee is told to type into SumUp is computed by the function that will compute it for
real, which is the only way practice is worth anything.

The expected-total check is kept. Learning that the till refuses when the screen and the basket
disagree is part of learning the till.

Not in the sandbox: opening or closing a bar session, comps (they need a duty manager's approval, and
a fictional approval teaches the wrong lesson), and voids.

### 5.2 Challenge 25 (`challenge-25`)

The accept tap and the refusal form: reason, product, description, notes. The register view shows the
run's own events only, so a trainee sees their entries appear and nothing of the real register.

Refusal copy discipline is the thing being taught here as much as the buttons: descriptions record
what happened, never who
([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)). The sandbox should say so at
the point of entry, since that is where it matters.

### 5.3 Door (`door-scan`)

Lookup by scan, reference or name against the fixture; the standing verdict, green, amber or red; the
party size. There is no admit action: the real door screen has none either, so a sandbox
button would teach a control that does not exist.

Payment and admission stay separate states here as they are for real, because confusing them is the
mistake this screen actually produces.

### 5.4 The practice ticket sheet

Not a fourth sandbox: a sheet of paper, and the only part of this feature that exists outside a run.
A door lesson needs something to scan. `/foh/practice-tickets` prints the five fixture bookings as QR
cards, one per booking, for a trainer to print and cut up before the lesson
([ADR-0043](./decisions/0043-practice-tickets-print-ahead-of-the-lesson.md)).

**It is not gated by a run or a practice window**, and it must not become so: a trainer prepares on
the afternoon nobody has anything open. `foh.work` is the whole guard, the same bar as the Practice
tile, and the page makes no API call at all, so it works with rehearsal down.

Each card carries the QR, the reference in text for when a camera will not read it, who the fixture
customer is, and what the trainee should see: the verdict colour, the party size, the money owed and
any access symbols. All of it is derived from the fixture through `bookingStanding`
(`shared/utils/bookingStanding.ts`, the same function the door computes with), so a card cannot print
an outcome the scanner disagrees with, and a change to the scenario reaches the paper.

The QR encodes the **bare reference**, `TRAIN1`, which is the string the scanner matches on after
`refFrom` unwraps it. It is deliberately not the `/t/<ref>?t=` URL a real ticket carries: a practice
card must resolve to nothing, and a phone camera pointed at one should offer no link to follow. No
generated reference can collide with a fixture one, because the reference alphabet excludes `I`.

Two cards read alike. `TRAIN2` is meant to be the already-admitted rescan, but the door screen has no
admit action and the fixture has no admitted-at field, so it is the same paid booking as `TRAIN4`
under another name. The sheet says so rather than inventing a difference: a rescan is practised by
scanning the same card twice, and the verdict must not change.

## 6. Domain model

```
training_runs        id · user_id FK · target_key
                     training_session_id TEXT NULL   -- rehearsal's session id, for the trail
                     started_at · expires_at
                     ended_at NULL · ended_reason ('ENDED'|'EXPIRED'|'PURGED') NULL

training_run_events  id · run_id FK (cascade) · at
                     kind ('SALE'|'AGE_CHECK'|'LOOKUP') · payload JSON
```

**These two tables are the only thing a training request may write.** Nothing else in the app reads
them, which is what makes the exclusion from every report structural rather than a filter somebody
has to remember ([ADR-0032](./decisions/0032-training-mode-writes-to-its-own-table.md)).

`bun run check:training` enforces it in CI on both sides. It reads every file under
`server/api/training/` and fails on a write to anything else, or a read of a table not on its
allow-list. It **also** reads the dual-mode pages and fails on any `/api/bar/**` or `/api/foh/**`
path fetched without `api(...)`. That second half is the one that matters most in practice: a
server-only check passes happily while a page reaches straight past the sandbox, which is exactly
what happened.

Events exist so a trainer can debrief ("show me what you rang up") and so the banner can show a
tally. They are scratch data, they aggregate to nothing, and they are deleted with the run.

`training_runs.user_id` joins the estate merge and erasure hooks on the commit that creates it
([ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md)), and takes the
**deletion** path rather than the anonymisation one. The reasoning is in ADR-0032; the short version
is that [ADR-0014](./decisions/0014-anonymise-never-delete.md) protects statistics, and this is not
one.

## 7. Routes

| Method | Route | Does |
|---|---|---|
| POST | `/api/training/start` | Asks the seam; on an open window, opens a run |
| POST | `/api/training/end` | Ends the run, deletes its events, in one batch |
| GET | `/api/training/state` | Active, time left, tally. Polled; re-asks the seam |
| GET | `/api/training/bar/tonight` | Fixture performances, live catalogue |
| POST | `/api/training/bar/transactions` | Real arithmetic, a `SALE` event |
| GET | `/api/training/foh/lookup` | The fixture only, never the database |
| GET/POST | `/api/training/foh/age-checks` | The run's own entries, an `AGE_CHECK` event |

Every one of them requires `foh.work` **and** an active run whose `target_key` covers the surface. The
role decides whether there is a sandbox at all, the run decides which one, and both are asked on every
request: a run row would otherwise outlive a revoked role by as long as rehearsal's expiry
([ADR-0044](./decisions/0044-a-practice-run-is-not-a-substitute-for-the-role.md)).

`server/middleware/trainingMode.ts` completes it from the other side: while a run is live,
`/api/bar/**` and `/api/foh/**` are refused, **reads included**. The only exceptions are a named
allow-list of show-night shell reads (`/api/foh/tonight`, `/emergency`, `/contacts`) that carry no
customer or money data. Belt and braces, per ADR-0032.

Blocking only writes is not enough, and it is worth saying because the first implementation did
exactly that: a practice screen that reads live data shows a trainee the real comps queue and real
people's tab balances. The guarantee is about what a sandbox can *reach*, not only what it can
change.

**Every operational path on a dual-mode page goes through `api()`, including ones with no sandbox
equivalent.** Wrapped, they 404 in practice mode; unwrapped, they reach real data, and a 404 is the
safe failure. Tabs, comps and opening or closing the bar have no sandbox, so they are additionally
hidden in practice mode and return early on `training.active`: unreachable rather than merely
misdirected.

## 8. Pages

**One page per screen, not two.** `app/pages/foh/bar/till.vue`, `app/pages/foh/age-checks.vue` and
`app/pages/foh/scan.vue` take their API prefix from a `useTrainingMode()` composable: `''` normally,
`'/api/training'` in a run.

**A screen entered as practice is pinned to it for as long as it is open.** Once pinned, a dual-mode
fetch made after the run has ended **refuses** rather than resolving to the live route, so the worst
outcome of a tap during the moment between a run ending and the page leaving is a message saying
nothing was sent. Resolving live there is the one thing this feature must never do, and it is not
enough to rely on navigating away: the poll is once a minute and the navigation is asynchronous, so
there is a real window. The pin has exactly one writer, set from the state at setup, because clearing
it as the run ends reopens the window it exists to close. Duplicating them would let the practice drift from the thing being
practised, which is the one failure that would make the whole feature worse than useless.

The banner is a layout-level component so it cannot be forgotten on a new screen.

`app/pages/foh/practice-tickets.vue` is the exception that proves the rule: it is on the `foh` layout
like every other screen there, but it is not dual-mode, because it fetches nothing. It reads the
fixture directly and renders it, so there is no live counterpart for it to drift towards (§5.4).

## 9. Reset

Three paths, one destination:

| Path | What ends it |
|---|---|
| Explicit | **End practice**: the run is `ENDED` and its events are deleted in the same batch |
| Expiry | Past `expires_at` every training route refuses, and the run is marked `EXPIRED` |
| Upstream | The lead marks the register in rehearsal, the window closes, the next state poll ends the run |

Only a **definitive** closure ends a run. If rehearsal cannot be reached, the run continues on the
expiry it already has, because ending a run also deletes its events and a transient blip must not do
that ([ADR-0034](./decisions/0034-an-open-sandbox-closes-only-on-a-definitive-answer.md)). Opening a
sandbox still needs a positive answer, so ADR-0033's direction is unchanged.

Plus a daily task that deletes ended and expired runs with their events, so nothing accumulates.

**Switching sandbox is not a fourth path, and it is one write.** Opening a different target ends the
old run, deletes its events and inserts the new run in a single `db.batch`, so a trainee moving from
the till to Challenge 25 cannot land with no run at all and their old sandbox gone. D1 rejects
`BEGIN`, so a batch is the only atomic write there is here. Every refusal, the closed window and a
lapsed expiry alike, is answered before that batch runs: a switch this app declines must leave the
sandbox the trainee already had exactly where it was.

The upstream path is why the seam is uncached and why rehearsal serves the endpoint `no-store`. A
cached yes anywhere between the two apps would keep a sandbox open after the lesson finished, which
is the one thing "reset afterwards" cannot allow.

## 10. Build order

0. **rehearsal must be there first**: practice targets, practice windows, `GET /api/v1/practice/:key`
   and a service token for this app. Nothing here works without them. **Done** (its phase 7).
1. **The shell.** `training_runs`, the seam, start/end/state, the banner, the Practice tile, the
   estate hooks, the purge task. No sandbox yet, which makes the guarantee reviewable before anything
   uses it. **Built.**
2. **Till.** **Built.**
3. **Challenge 25 and door.** **Built.**

The `/foh` pages moved onto an `foh` layout as part of stage 1. They previously each set
`layout: false` and drew their own full-screen shell; the layout adds nothing but the banner, which
is why it exists there rather than being pasted into each page.

## 11. Open questions

- **Should a trainer be able to watch a run live?** A lead seeing "they have rung up four baskets and
  refused one ID" would make a debrief better. It is also a second reader of the events table and a
  permission question. Default: no, the debrief is the trainee showing the trainer their screen.
- **How long should a run be allowed to last?** rehearsal sets `expires_at` from the session end plus
  a configurable grace. Whether that is the right shape will not be clear until a term of it.
- **Does the fixture need a second scenario** (a quiet night, a sold-out one)? Probably eventually.
  One is enough to start, and a second is a constant.
- **Should practice be available to anybody with a confirmed BAR shift**, trained or not, as a warm-up
  before doors? Tempting and cheap. Rejected for v1 because it widens who can reach a sandbox beyond
  what rehearsal was asked to authorise, and the answer belongs there rather than here.
