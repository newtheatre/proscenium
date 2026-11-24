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
