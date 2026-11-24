# 4. Interface to other modules

Practice mode declares two points and two kit options, and asks each module with live screens for a scenario and a sample set. No module branches its own logic on practice; it only declares what the kit needs.

## Points declared

### `core.practice-scenario` (data)

One contribution per thing a person can practise. Owned by the module whose screen it opens.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | `<module>.<name>`, stable for ever: Training's lessons link to it. `box-office.door-scan` |
| `version` | Yes | Raised when the sample setup or tasks change. A store keeps the version it was made with (S8) |
| `label`, `summary` | Yes | Catalogue keys. "Scan tickets at the door"; "Tonight's show is 60% sold. Admit the audience, find a lost booking and handle a ticket for the wrong night." |
| `minutes` | Yes | Roughly how long it takes, shown on the card |
| `needs` | Yes | Modules that must be switched on in the real site (S1) |
| `samples` | Yes | Sample set ids to run, in addition to core's base sets |
| `start` | Yes | The live page it opens, with placeholders filled from the sample sets' named results: `/live/door/{tonight}` |
| `routes` | Yes | Page patterns the trainee may reach. Any other page shows "Not part of this practice" (screen PM-S5) |
| `abilities` | Yes | Abilities the person holds inside the store (M6). The build refuses abilities with `grantAt` limited to the site that the scenario's module does not own |
| `tasks` | No | `{ id, label, check }`. `check` is a server function in the contributing module that reads its own tables in the store and answers true or false (T1) |
| `runnable` | No | Scheduled task ids the trainee may run from the panel (O4) |
| `outcomes` | No | For each declared external call the scenario uses, the answers the trainee may pick (part 5, card reader panel) |

Build checks: the id's module is the contributor; every ability, sample set, route, task id and catalogue key exists; first-release `start` and `routes` are pages under `/live`.

### `core.practice-sample` (code)

A named group of fictional records. Owned by the module whose tables it writes.

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>`: `core.tonight`, `box-office.sold-house` |
| `after` | Sample set ids that must run first. A cycle fails the build |
| `seed(unit, context)` | Adds statements to the store's unit through the module's own services, and returns named results such as `{ tonight: 'perf_…' }` that scenarios use in `start` and later sets read from `context.results`. The kit refuses to run a seed outside a store |

### Record type and the fact that opens practice

Practice declares the record type `core.practice-scenario`, with no table: its ids are the contributed scenario ids, and its resolver gives the scenario's label and `/practice/<id>`. Matt decided on 24 November 2026 that practice is reached only through a Training course, so Training declares the fact that opens it (agreed with the Training thread):

| Fact | Owner | On | Held by a person for scenario X while |
| --- | --- | --- | --- |
| `training.practice-open` | Training | `core.practice-scenario` | (a) they may view a course (`training.course.view`) whose current published version has a lesson with a `practice` section naming X; or (b) they hold a current training record for a course whose version, as awarded, names X; or (c) they are a trainer of such a course. Archived courses and courses in preparation open nothing |

Practice reads only the fact, never Training's tables. With Training switched off nobody holds it, so only administrators can practise.

## Kit options and services

| Name | Kind | Meaning |
| --- | --- | --- |
| `defineTable(…, { practice })` | Table option | `empty` (default), `copy` or `replace`, as part 2 |
| `defineTable(…, { store: 'practice' })` | Table option, core only | The table exists only inside a store. Used by practice's own four tables |
| `defineCall({ practice })` | Call option | `practice(call, context)` returns the outcome to record instead of making the call, or `'ask-trainee'` to wait for the trainee's choice on the card reader panel. Without it the call is refused in practice (O1) |
| `isPractice()` | Kit function | True inside a store. For wording and print only ("This email was not sent"); a conformance check flags any use in a module's `server/` code outside `calls/` and print helpers |
| `endPractice(accountId, reason)` | Kit service | Ends a person's store. Called by Identity's erasure and merge jobs (S9) |

## What each module contributes

| Module | Contributes | Change to its spec |
| --- | --- | --- |
| Foundations (kit) | `PracticeStore` and the `PRACTICE` binding; the context swap; rules M1 to M5 and O1 to O5; the copy; the in-store job runner; the two table options and the call option | Part 2 formats (table and call options), part 4 index (points, prefixes `pss`, `pob`, `pca`, reserved address `/practice`), part 3 (a note that a practice store is not a second database) |
| Interface | The practice frame (banner, border, title, panel), the print line, the scenario list, the mark in the one fetch wrapper | UI-29 closed and pointing here; the "Practice mode" row in its screen inventory becomes part 5 of this spec |
| Identity | Sample set `core.people`: one "Practice staff" account and about 40 fictional audience members and members; the access answer inside a store (M6); rule M4's route list; calling `endPractice` from erasure and merge | Part 3 (erasure and merge steps), part 4 (sample set) |
| Core domain | Sample set `core.tonight`: a sample production, "The Practice Play", with tonight's performance at the first active venue starting 45 minutes after the session starts; the mailer's outbox path | Part 4 (sample set), notifications rule on sealed variables in practice |
| Payments | Provider `practice-reader` on `payments.provider` (card on the desk channel); `provider_accounts` marked `replace`; a practice answer `'ask-trainee'` on `payments.start-payment`; sample set `payments.float` (a till ready to open with a float); scenario `payments.till` | Part 4 (provider, call option), part 5 (reader panel) |
| Box office | Sample set `box-office.sold-house` (tonight 60% sold, four unpaid reservations, two bookings with access needs, one pass holder, one ticket for tomorrow); scenarios `box-office.door-scan` and `box-office.desk-sale` | Part 4 (scenarios and sample set) |
| Finance | Nothing beyond the copy. Postings land in the store's ledger | Part 2 (copy option on accounts and tax codes) |
| Front of house | Scenarios `front-of-house.night` and `front-of-house.incident`, and sample set `front-of-house.on-shift`, in the first release | Later |
| Bar | Scenario `bar.till` and sample set `bar.stocked`, in the first release | Later |
| Training | A lesson section of kind `practice` names a scenario id and links to `/practice/<id>`. Completing it is the learner pressing "I've tried it". Training declares the fact `training.practice-open` on `core.practice-scenario` (below), the only way a person may practise. Later, it may act on `core.practice.scenario-completed` | Agreed with the Training (amended) thread, 23 and 24 November 2026 |
| Reports | Counts nothing from practice; no report screen is a scenario in the first release | Agreed with the Reports thread, 23 November 2026 |
| A theatre's own modules | May contribute scenarios and sample sets. Their outbound calls are stopped by O2 whether or not they declare anything | None |

## Scenarios: every live screen

Matt decided on 24 November 2026 that every live screen is practisable from the start. The build enforces it: a page under `/live` (other than the live home) that no scenario's `routes` covers fails the build, so a new live screen cannot ship without its scenario. The live pages built today are the door (`/live/door`), the till (`/live/till`, which the bar also sells through) and front of house (`/live/front-of-house`: the night, people, checklists, report, incident and emergency card).

| Scenario | Owner | Opens and allows | Acts with | Sample sets | Tasks |
| --- | --- | --- | --- | --- | --- |
| `box-office.door-scan` | Box office | `/live/door/{tonight}`, the door list and its print | `box-office.ticket.admit`, `box-office.order.view`, `box-office.order.release` | `core.people`, `core.tonight`, `box-office.sold-house` | Admit five tickets; find a booking by surname; refuse the ticket for tomorrow; release the unpaid no-shows |
| `box-office.desk-sale` | Box office | `/live/till` with tonight's performance | `box-office.order.sell`, `box-office.order.take-payment`, `payments.session.open` | as above, plus `payments.float` | Sell two full-price tickets by card; sell a member ticket after checking the card; reserve one to pay later |
| `payments.till` | Payments | `/live/till` | `payments.session.open`, `payments.session.view`, `box-office.order.sell` | `core.people`, `core.tonight`, `payments.float` | Take a declined card then a good one; take cash and give change; close the till with the right count |
| `bar.till` | Bar | `/live/till` on a bar outlet | `payments.session.open` and the bar's selling abilities | `core.people`, `core.tonight`, `payments.float`, `bar.stocked` | Sell a recipe drink; refuse a sale after a failed age check; open and settle a tab |
| `front-of-house.night` | Front of house | `/live/front-of-house/{tonight}` with people, checklists and the report | `front-of-house.assignment.check-in`, `front-of-house.checklist.complete`, `front-of-house.night-report.write`, `front-of-house.shift.view` | `core.people`, `core.tonight`, `box-office.sold-house`, `front-of-house.on-shift` | Check in the team; complete the opening checklist; write and submit the night report |
| `front-of-house.incident` | Front of house | `/live/front-of-house/incident` and `/live/front-of-house/emergency/{venue}` | `front-of-house.incident.report`, `front-of-house.emergency-card.view` | `core.people`, `core.tonight`, `front-of-house.on-shift` | Find the emergency card for the venue; report a first-aid incident with its people |

Live screens other specs add later bring their own scenario in the same pull request: Box office's door headcount (BO-73, festival-ready changes) extends `box-office.door-scan`; Festival adds `festival.control` and `festival.sheet` for its two live pages; any live screen Productions adds needs one of its own.

The contributions are numbered in the festival-ready changes spec (spec 15): BO-77 (`box-office.door-scan`, `box-office.desk-sale`, `box-office.sold-house`), PAY-10 (`payments.till`, `payments.float`, the practice-reader provider), BAR-59 (`bar.till`, `bar.stocked`), FH-55 (`front-of-house.night`, `front-of-house.incident`, `front-of-house.on-shift`) and C-76 (`core.tonight`, `core.people`, which covers Identity's part). PM-20 is met when those five stories are.

## Events

| Event | Direction | When | Payload | Internal |
| --- | --- | --- | --- | --- |
| `core.account.erased`, `core.account.merged` | Heard, through Identity's jobs calling `endPractice` | A person is erased or merged away | account ids | yes |
| `core.practice.scenario-completed` | Announced, **later** (PM-22) | Every task in a session passed and `core.practice.report-completion` is on | account id, scenario id, scenario version | no: Training listens |

Every event a module announces inside a store stays in the store and is heard only by listeners running in the store (O4). Nothing announced in practice reaches the real database.
