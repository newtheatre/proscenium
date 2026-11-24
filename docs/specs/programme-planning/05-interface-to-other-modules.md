# 4. Interface

Programme planning requires only core and the support module occupancy (question 1, decided (d)), uses `forms` and `companies`, and reaches every other module through services, events, points and facts as Foundations defines them. Because it must run with Companies, Festival, Spaces and Rehearsals switched off, it calls no service of theirs (Foundations' rule M3); they reach it through the five points it declares, and it reaches them through core's points.

## The module

| Module | Id | Requires | Uses | Can be switched off | Owns |
| --- | --- | --- | --- | --- | --- |
| Programme planning | `programme-planning` | occupancy, a support module with no switch (core is never listed) | `forms`, `companies` | Yes | The thirteen tables in part 2 |

```ts
// layers/programme-planning/module.ts
export default defineModule({
  id: 'programme-planning',
  manifest: 1,
  since: '0.9.0',
  stability: 'experimental',
  requires: ['occupancy'],
  uses: ['forms', 'companies'],

  settings, abilities, records, tables,

  events: {
    announces: { /* the table below */ },
    listens: {
      'forms.response.decided':     'response-decided',
      'forms.response.withdrawn':   'response-withdrawn',
      'core.production.cancelled':  'production-cancelled',
      'core.performance.cancelled': 'performance-cancelled',
      'core.performance.rescheduled': 'performance-moved',
      'core.performance.moved':     'performance-moved',
      'core.space.archived':        'space-archived',
      'core.season.archived':       'season-archived',
    },
  },

  jobs:  { 'programme-planning.send-slot-notices': job({ lane: 'prompt' }) },
  tasks: {
    'programme-planning.gather-notices': task({ every: '5m' }),
    'programme-planning.close-plans':    task({ dailyAt: '04:30' }),
    'programme-planning.prune-entries':  task({ weeklyOn: { day: 'sunday', at: '03:00' } }),
  },

  points: { /* the five below */ },
  contributes: { /* the table below */ },
  presets: { /* part 6 */ },
})
```

`forms` cannot be switched off, so listing it in `uses` records only that this module contributes to its points and calls none of its services. The `since` version is a placeholder until the roadmap places the module.

## Record types

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `programme-planning.plan` | plans | `core.season` | none |
| `programme-planning.entry` | entries | `programme-planning.plan` | `applicant_account_id` |
| `programme-planning.offered-slot` | offered slots | `programme-planning.plan` | none |
| `programme-planning.pencil` | pencils | `programme-planning.entry` | none |

So a grant on a season reaches its plan, entries, slots and pencils: "programmer for the summer festival" is one grant. The applicant owns their entry only to read its status (part 6).

## Services

Named exports of `layers/programme-planning/server/services.ts`. A module calling them lists `programme-planning` in `requires`; none in this round does.

| Service | Returns or does |
| --- | --- |
| `planFor(seasonId)` | The plan or null |
| `entriesOf(planId, { states })` | Entries with their placement counts |
| `entryOfProduction(productionId)` | The entry that made a production, or null |
| `warningsFor(planId, { from, to })` | The warnings of part 3 for a window, as the board shows them |
| `addEntry(unit, input)` | Statements that add a candidate entry. Used by this module's own import and by any future module that requires it |

## Points this module declares

| Point | Kind | A contribution is | Contributor in this round |
| --- | --- | --- | --- |
| `programme-planning.entry-contacts` | code | Given an entry id and its company id, more account ids to tell about slots | Companies: the engagement's contacts who opted into schedule messages |
| `programme-planning.entry-source` | code | For a season, things waiting for a slot: a reference, a title, minutes, kind, company id | Companies: engagements with a season and no production |
| `programme-planning.board-days` | code | For a season, the days the board's day selector offers, with labels; nothing for an ordinary season | Festival: the festival's operating days |
| `programme-planning.entry-panel` | data | A panel on the entry page, with an ability | Budgets and claims (funding asked for), later |
| `programme-planning.import-format` | code | A file format the entry import reads | This module: spreadsheet. Later a pretalx export, shared with core's programme import (C-63) |

## Events this module announces

Payloads carry ids and enumerated values only. Every entry event is internal, because the fact that someone proposed a show can be sensitive.

| Event | When | Payload | Internal |
| --- | --- | --- | --- |
| `programme-planning.entry.added` | An entry is created | entryId, planId, source | Yes |
| `programme-planning.entry.accepted` | E4 | entryId, seasonId, productionId, applicantAccountId, companyId, rightsStatus | Yes |
| `programme-planning.entry.declined`, `.withdrawn` | E5 to E8 | entryId, reason | Yes |
| `programme-planning.plan.published` | U4 | planId, seasonId, scheduledCount | No |
| `programme-planning.placement.changed` | A scheduled placement moved after publish | performanceId, entryId | No |
| `programme-planning.slots.told` | N6 | entryId, kind | Yes |

## Events this module listens for

| Event | From | Does |
| --- | --- | --- |
| `forms.response.decided` | Forms | Declined: rule E5. Approved is handled by the outcome action, not here |
| `forms.response.withdrawn` | Forms | Rule E6 |
| `core.production.cancelled` | Core | Rule E8 |
| `core.performance.cancelled`, `.rescheduled`, `.moved` | Core | Marks the placement for a changed or cancelled notice (N3) when a programmer changed it outside the board |
| `core.space.archived` | Core | Drops the space from the board's columns; its pencils are deleted |
| `core.season.archived` | Core | Closes the plan |
| `core.account.merged` | Identity | The entry-people handler (part 2) |

## What this module contributes

| Point | Owner | Contribution |
| --- | --- | --- |
| `forms.slot` | Forms | `programme-planning.call`: subject `core.season`, submission mode, respondent the acting person, limit 1, no payment. Replaces the forms-declared `forms.season-call`, which never had a host |
| `forms.bindable` | Forms | Entry attributes a call question may write: title, kind, category, running time, get-in, get-out, performances wanted, shape, rights status, entry windows, tech needs, slot choices, people, collections asked for |
| `forms.field-type` | Forms | `programme-planning.offered-slot`, a picker of the plan's offered slots; `programme-planning.time-ranges`, can and cannot times inside the plan's range |
| `forms.outcome-action` | Forms | `programme-planning.accept-entry` (rule E4), safe to run twice by its guard |
| `forms.template` | Forms | "Call for proposals" and "Festival call", each with its bindings set |
| `core.space-busy` | Core | Pencils, as yielding, labelled "Pencilled" to anyone who may not view the plan |
| `core.person-busy` | Core | Pencils for an entry's people, advisory |
| `core.vocabulary` | Core | `programme-planning.tech-need`, starting terms: blackout, piano, projector, sprung floor, haze allowed, live band, fly bars, wheelchair access to the stage |
| `core.record-tab` | Interface | "Programme" on a season's console page: the plan overview; "Entry" on a production made from an entry |
| `core.change-impact` | Core | "This production came from an entry; 2 acts have been told these times" when a told placement is moved in core |
| `core.record-resolver` | Foundations | The four record types |
| `core.navigation` | Foundations | Part 5 |
| `core.home-card` | Interface | "Plans with hard clashes" and "Entries waiting for a decision" on the console home |
| `core.notification-topic`, `core.notification-type` | Core | Topic `programme-planning.slots` (side members and audience), types below |
| `core.account-section` | Interface | "My entries" under the account: each entry's state and, once told, its slots |
| `core.erasure-handler`, `core.export-contributor`, `core.privacy-record` | Foundations and Identity | Part 2 |
| `core.health-check` | Foundations | A published plan with placements still draft for over seven days; a space on the board with no tech features recorded while entries need some |
| `core.measure` | Reports | Optional: entries by state per season; share of entries placed |

### Notification types

| Type | Category | Sent to | Sent when |
| --- | --- | --- | --- |
| `programme-planning.slots` | Transactional | Rule N2 | First notice (N3) |
| `programme-planning.slots-changed` | Transactional | Rule N2 | A told slot moved or was cancelled |
| `programme-planning.entry-received` | Transactional | The applicant | Never from here: the form builder's own receipt covers it. Listed so nobody adds it |

## Routes

All under `/api/programme-planning/`, written with `defineRoute`. None is public.

| Route | Ability | Purpose |
| --- | --- | --- |
| `GET /plans`, `GET /plans/<season>` | `plan.view` | Plans, and one with counts |
| `POST /plans` | `plan.manage` | Start a plan for a season |
| `GET /plans/<id>/board?from=&to=&view=` | `plan.view` | Occupancy, placements, pencils, tray and warnings for a window (W12) |
| `POST /plans/<id>/board/moves` | `placement.manage` | One drop, move or removal, with the expected version. Idempotent |
| `POST /plans/<id>/publish/preview`, `POST /plans/<id>/publish` | `plan.publish` | U2 and U4. Publish is idempotent and carries the version and count |
| `POST /plans/<id>/notices` | `plan.publish` | Tell acts now (N5) |
| `GET`, `POST`, `PATCH /entries`, `/entries/<id>` | `entry.view`, `entry.manage` | Entries |
| `POST /entries/<id>/accept`, `/decline`, `/withdraw` | `entry.decide` | E3 to E7, for entries not from the call |
| `POST /entries/<id>/warnings/<key>/acknowledge` | `placement.manage` | W11 |
| Everything under `/offered-slots/`, `/spaces/` that writes | `plan.manage` | Offered slots, space profiles and features |

Console pages live under `/console/programme`; the account page under `/account/entries`. No address prefix needs reserving.

## What core must add

| Core story | What | Agreed with |
| --- | --- | --- |
| C-60 to C-62 (Festival-ready changes) | `listCollections`, `collectionsFor`; line-up services `addLineUpItem`, `moveLineUpItem`, `removeLineUpItem`, `lineUpsFor`; performance `shape` timed or drop-in | Festival-ready changes, 23 November 2026 |
| FB-512 extension (Festival-ready changes) | `createProduction(unit, input)` returning the new id, always draft; `createPerformance`, `movePerformance`, and `schedulePerformances(unit, ids)` returning scheduled and refused ids with reasons | Festival-ready changes, 23 November 2026 |
| OC-01 to OC-03 (this spec); C-65 is the support-module kind | The occupancy service and a read-only occupancy grid component, rules O1 to O4, in the support module occupancy (on whenever a module requiring it is on; shown on the Modules screen without a switch) | Question 1 decided (d), Matt, 23 November 2026; needs the Foundations support-module kind; Integration amends R3-03 |
| C-66 (Festival-ready changes) | `core.person-busy`, with core's own contribution of credited accounts in overlapping performances | Rehearsals and Festival-ready changes, 23 November 2026 |

**The occupancy module** **in one paragraph.** As a module that shows a space's time, I read everything occupying a set of spaces in a window in one call. `occupancy({ spaceIds, from, to })` returns per space an ordered list of items: kind (performance-scheduled, performance-draft, closure, public-holiday, or a contributor's own kind such as room-booking or pencil), source module, start, end, yields, a record reference, and a label or "Busy" (O2). The module also offers `OccupancyGrid`, a read-only grid of spaces against time that draws those items in the eight calendar colours with a word and a border for kind (Interface's calendar rules), which this module's board extends with drag and the tray, and Spaces' calendar (UI-35) may reuse. Reports reads the same service for `core.room-use`.

## Agreed with sibling specs, 23 November 2026

| With | Agreed |
| --- | --- |
| Festival | Board, tray, pencils, warnings, publish and slot notices are this module's for every season, festival or not. Festival's tab on a season links to `/console/programme/<season>`. Festival listens for `plan.published` only, and contributes festival days to `programme-planning.board-days`. Notices use platform words; no wording point |
| Companies | `company_id` is an opaque `companies.company` id; `uses`, not `requires`. Companies listens for `entry.accepted` and opens the engagement itself; contributes to `entry-contacts` and `entry-source`; sends no slot notices of its own. Words: entry is this module's, engagement Companies', act Festival's |
| Festival-ready changes | The core services in the table above, with these names. C-60 to C-64 as the map has them, C-65 the support-module kind, the occupancy module's OC stories this spec's, C-66 onwards theirs |
| Productions | Listens for `entry.accepted`, which carries `rightsStatus`; reads the proposed team as core credits on the draft production |
| Rehearsals | Places only rehearsal calls, through Spaces; tech and dress in the performance space are Rehearsals' calls. Reads `occupancy`; contributes calls to `core.person-busy` |
| Reports | "Occupancy" is this view's word; the seat figure is "capacity filled" and the room figure "room use", contributed by core from the occupancy module's service |
| Inventory | Occupancy covers spaces only and never decides a write; items stay between Spaces and Inventory |

## Index of names

| Kind | Names |
| --- | --- |
| Module id and table prefix | `programme-planning`, `programme_planning_` |
| Id prefixes | `pppl`, `ppsl`, `ppen`, `ppav`, `pppc`, `ppck`, `ppnt` |
| Record types | plan, entry, offered-slot, pencil, under `programme-planning.` |
| Points | entry-contacts, entry-source, board-days, entry-panel, import-format |
| Form slot, field types, outcome action | `programme-planning.call`; `programme-planning.offered-slot`, `programme-planning.time-ranges`; `programme-planning.accept-entry` |
| Vocabulary | `programme-planning.tech-need` |
| Refusal codes | `programme-planning.stale`, `programme-planning.publish-refused`, `programme-planning.count-changed`, `programme-planning.slot-full`, `programme-planning.not-candidate`, `programme-planning.scheduled` |
| Job and tasks | send-slot-notices; gather-notices, close-plans, prune-entries |
| Notification topic | `programme-planning.slots` |
