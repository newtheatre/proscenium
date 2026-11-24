# 11. Build notes

How the build meets this spec, slice by slice, and where it departs from the wording above.

## Slice 1: the store behind every marked request (PM-02 to PM-09, PM-14, PM-15, PM-17, PM-19)

Built in the kit and core; the screens (PM-10 to PM-13, PM-16's sheet, PM-18) and the six
scenarios (PM-20) follow. Tests: `layers/core/tests/integration/practice.test.ts` (T-PM-01 to
T-PM-06, T-PM-09 to T-PM-12, T-PM-17, T-PM-20 to T-PM-23) and `tests/unit/practice.test.ts`
(T-PM-07, T-PM-08), with a fixture scenario, sample set and check in `tests/fixtures/modules/seats`.

| Part | As built |
| --- | --- |
| Routes | `GET /api/core/practice` (PM-S1's list), `POST /api/core/practice/start` (`{ scenario, again?, replace? }`), `POST /api/core/practice/leave`, and inside a store `GET /api/core/practice/session` (the panel), `GET /api/core/practice/outbox/:id`, `POST /api/core/practice/calls/:id` (the card reader's answer) and `POST /api/core/practice/reassert` (the pretend prompt) |
| Settings | `core.practice.enabled`, `idle-end`, `scenarios-off` and `copy-configuration` on Admin > Practice, a generated settings page. `report-completion` arrives with PM-22 |
| Copy | Core copies `core_modules`, `core_settings` (less sensitive and managed settings), `core_vocabularies`, `core_term_groups`, `core_terms`, `core_venues`, `core_spaces` and `core_place_access`. Each module's own tables are marked with its scenario (PM-20). `core_files` rows and their images are not copied yet, so a store shows the theatre's name but not its logos |
| Sample sets | `core.people`: Practice staff, the person under their display name, and forty fictional people from the catalogue's list (`core.practice.sample-names`), at `@practice.invalid` with phone numbers 07700 900001 onward. `core.tonight`: "The Practice Play" at the first active performable space, 45 minutes after the start; with nothing copied, a practice venue stands in |

### Departures from the wording

- **The store's own tables** are not declared with `defineTable(..., { store: 'practice' })`: a
  declared table would be migrated into D1. They are made from `#kit/practice/tables` after the
  bundle, and their prefixes `pss`, `pob` and `pca` are held in the registry's index.
- **`core_practice_session`** also keeps `night_ends_at` (to tell an idle end from the end of the
  night), `reasserted_at` (the pretend prompt, M6) and `results` (the sample sets' named results).
  **`core_practice_calls`** keeps `attempt_id`, so the trainee's answer finds its attempt.
- **Task checks** are a code point of their own, `core.practice-check`, keyed by scenario id: a data
  point's entry cannot carry a function.
- **The record type** `core.practice-scenario` takes its ids from the point's contributions
  (`record({ point })`), a third kind of record type beside those with a table or fixed ids.
- **M4** is a route option, `practice: 'refuse'`, rather than a list kept by the kit. There is no
  update card route yet; F-28 adds it with the option.
- **The fact `training.practice-open`** is Training's to declare (lane D). Until it is, only
  administrators (`core.practice.manage`) can practise.
- **"No answer"** on the card reader records `unknown` and settles nothing, so the till takes its
  timeout path.

## Slice 2: the frame and the screens (PM-10, PM-12, PM-13, PM-16, PM-18)

The screens PM-S1 to PM-S9 in core's app, with the browser test `tests/e2e/practice.spec.ts`
(T-PM-13, T-PM-16) against a gallery scenario, `gallery.door`, and unit tests of the addresses in
`tests/unit/practice.test.ts`.

| Part | As built |
| --- | --- |
| Addresses | Every page under `/live` is also served under `/practice/live` (core's `pages:extend` hook), so a live page is practised unchanged. `/practice` is PM-S1, `/practice/<scenario id>` PM-S2 and PM-S6 (`?ended=1`), `/admin/practice` PM-S9 |
| The frame | `PracticeFrame`, drawn by `app.vue` on every `/practice` page: the banner with the tasks count and the panel button, the border, the title prefix and the print line. Round a live page only, the panel (`PracticePanel`), the card reader (`PracticeCardReader`) and the fence (`PracticeFenced`) |
| The mark | `$api` adds `Proscenium-Practice: 1` on a practice page, on the server render too. A change reads the panel again (T1), a "confirm it's you" refusal opens the pretend dialogue (`PracticeConfirmDialog`, M6), and `core.practice.ended` opens PM-S6 |
| Navigation | The global middleware `00.practice.global.ts` opens a live link in the frame and fences any page outside the scenario's `routes`; the Tonight hub is always inside. Leaving goes to the page that opened practice (`?from=`) or `/live` |
| Device copies | `useLiveData` and `useLiveQueue` keep practice copies under `practice:` keys, removed on leaving or starting again; `useRealtime` keeps practice rooms apart and always asks for their tickets with the mark |
| Run now | `POST /api/core/practice/run` (`{ task }`) runs one of the scenario's `runnable` tasks in the store (T-PM-18) |
| Entry points | The Tonight hub's "Practise" button and a live screen's "Practise this screen" (in its strip, which has no menu) show only when `GET /api/core/practice` lists a scenario; the list now gives each scenario's `routes` |

### Departures from the wording

- **The card reader sheet** does not show the amount: an external call's attempt keeps no amount,
  and the till behind the sheet shows it.
- **PM-S1** lists scenarios in one list, not grouped under the live screen each opens, and names no
  course until Training declares `training.practice-open`.
- **PM-S9** is a generated settings page: the scenarios switched off are the `core.practice.scenarios-off`
  list, not a switch on each scenario.
- **Printing** carries "Practice: not valid" at the head of the first page. Signing practice codes
  with the store's keys (PM-11) comes with the door's scenario (PM-20).

## Slice 3, part 1: the door, the till and a desk sale (BO-77, PAY-10, C-76)

Three scenarios with their sample sets and checks, tested in
`layers/box-office/tests/integration/practice.test.ts`.

| Part | As built |
| --- | --- |
| `core.tonight` | Also makes tomorrow's performance at the same time (`tomorrow`), for the ticket the door turns away |
| `box-office.sold-house` | A band, the theatre's own full-price ticket type (or a "Full price" one), a price, sales for both nights and 40 seats at most. 60% of tonight is booked through the import service as bookings made elsewhere: four reservations unpaid, one seat taken by a practice pass, the rest paid. Tomorrow has one paid booking whose code is `TMRW2345`. Sales open only where the store has a way to pay |
| `box-office.door-scan` | Opens `/live/door/{tonight}`. Tasks: admit five tickets, find a booking by name and let them in, turn away tomorrow's booking, release the unpaid no-shows |
| `box-office.desk-sale` | Opens `/live/till`. Tasks: sell two tickets paid for (by card), reserve one to pay later |
| `payments.float` | The practice card reader account (provider `practice-reader`, `practiceOnly`, never offered to a real site), its card clearing account, the till's place at tonight's space and a £50 float where the theatre set none. Returns `cash` when the theatre's own cash account came across |
| `payments.till` | Opens `/live/till`. Tasks: a card declined then one taken, cash with change (only with `cash`), the till closed with the right count |
| The practice card reader | `payments.start-payment` answers `'ask-trainee'` in practice; the trainee's answer on the card reader is recorded as the reader's (`applyAnswer`), so the till carries on as it would for real |
| Practice codes | A store starts with no signing keys, so tickets it issues are signed with keys it makes itself (PM-11): the real door answers "bad signature" to one |
| Copied | Box office's ticket types, seating layouts, pass types and pass prices; Finance's accounts; Payments' provider accounts (`replace`) |

### Departures from the wording

- **Two bookings with access needs** are not in `box-office.sold-house` yet: an accepted access
  profile is Identity's to write and has no service a sample set can call. The door's Needs panel is
  empty in practice until it has one.
- **Bands and tax codes are not copied.** A band belongs to a production, and productions are not
  copied; the sample set makes its own. Finance's tax codes are seeded by its migrations, so a copy
  would repeat them.
- **"Find a booking by surname"** is "find a booking by name and let them in", ticked by the door's
  own answer to an admission from its list, since searching the list writes nothing.
- **The desk sale's member ticket** waits for a Membership sample set: practice people have no
  memberships for a member price to check.
- **The bar till's tab** is not built in Bar yet, so `bar.till` has no tab task when it comes.
- **Checks may read the change just made** (`context.answer`), and a task may depend on a result
  (`when`), so turning a ticket away and taking cash can be tasks without new tables.

## Slice 3, part 3: front of house (FH-55)

Two scenarios and their sample set, tested in
`layers/front-of-house/tests/integration/practice.test.ts`.

| Part | As built |
| --- | --- |
| `front-of-house.on-shift` | Two published shifts for tonight: a lead duty with the trainee on it, and a second duty with the four practice people `core.people` names first, all confirmed by the store's "Practice staff" (a unit each, as a manager putting people on the rota makes them). Both are called for now, or earlier where the duty's own call is, so the window is open as the trainee arrives. The theatre's own copied duties serve, or "Duty manager" and "Steward" are made; its first opening checklist for the venue serves, or a four-item "Opening checklist" is made; its card for tonight's venue serves, or a card that says it was made for practice. Returns `venue` and `checklist` |
| `front-of-house.night` | Opens `/live/front-of-house/{tonight}`. Needs Front of house and Box office (for `box-office.sold-house`, which fills the board's figures). Tasks: check in the team (everyone on tonight's rota has checked in or was marked as not coming; working the checklist checks the trainee in, as part 3 of Front of house says), complete the opening checklist (its run for tonight is complete, with or without exceptions), write a note in the night report and sign it off |
| `front-of-house.incident` | Opens `/live/front-of-house/{tonight}`, whose foot has "Report an incident" and "Emergency card". Tasks: find the emergency card for the venue (the card's own read answered with tonight's venue's card), report an incident where first aid was given, with at least one person named |
| Ticking on a read | Opening a card writes nothing, so the kit gains a route option, `practice: 'ticks'`: inside a store the checks run after such a read as after a change, and a response that ticked a task carries `Proscenium-Practice-Ticked: 1`, on which `$api` reads the panel again. The card's page now reads `GET /api/front-of-house/emergency-cards/:venueId`, which is that read. The list still keeps every card on the device, and the board and front of house tonight still fetch it ahead, which ticks nothing |
| Copied | Front of house's duties, checklists, checklist items and emergency cards |
| Device copies | A practice tab keeps its emergency cards under a key of its own, which leaving practice forgets, so a practice card never shows on the real card page with no signal |

### Departures from the wording

- **Abilities.** In a store the on-shift fact grants nothing, as the theatre's fact mappings are
  Identity's and not copied, so each scenario lists what being on shift tonight gives for real.
  `front-of-house.night` also holds `front-of-house.night-report.sign-off`: submitting the report is
  signing it off, which needs someone leading. `front-of-house.incident` also holds
  `front-of-house.shift.view`, which opens tonight's board, ties the report to tonight and lets its
  people be picked from tonight's rota.
- **Routes.** A scenario's routes are page prefixes and the board's address is a performance id, so
  both scenarios allow the whole of `/live/front-of-house`: the board, people, checklists, report,
  handouts, incident and emergency card. `front-of-house.incident` opens tonight's board rather than
  the report page, so that finding the card is a task and not where it starts. Neither holds
  `front-of-house.handout.record`, so the handouts pages are covered but refuse in practice.
- **Rota templates are not copied**: no practised screen reads them.
- **The card task** needed the kit option above: rule T1 runs checks only after a change.

## The live coverage check (PM-20)

`bun run check:conformance` reports "Every live page can be practised" (`scripts/checks/practice.ts`):
any page under `/live`, other than the live home, that no `core.practice-scenario` lists in its
`routes` fails the build. A route covers its own address and every page below it.
