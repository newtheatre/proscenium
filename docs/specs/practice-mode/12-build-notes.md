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
