# 4. Interface to other modules

Reports requires only core and reads every figure through core's `readMeasure`, so it works with any set of modules switched on. The figures each module will contribute are listed below. Every third-round thread's figures are agreed (Integration rulings, 23 November 2026); built modules' figures go through Integration as amendment stories.

## Manifest

```ts
defineModule({
  id: 'reports', manifest: 1, since: '<release>',
  requires: ['core'],
  uses: ['governance'],             // contributes the handover section; nothing if absent
  points: { 'reports.report': point({ kind: 'data', schema: readyMadeReport }) },
  tables: [definitions, runs, schedules, scheduleRecipients, pins],
  jobs: { 'reports.run-report': { lane: 'bulk' } },
  tasks: { 'reports.run-schedules': { every: '15m' }, 'reports.expire-runs': { dailyAt: '03:30' } },
  events: { announces: ['reports.run.finished', 'reports.schedule.paused'] },
})
```

`reports` must be added to the reserved module ids when this spec is accepted. Both events are internal: they carry run and schedule ids only, and never leave in a webhook.

## What core gains (to the Festival-ready core amendments and Foundations)

| Name | Kind | Note |
| --- | --- | --- |
| `core.measure` | code point | Contract in tab 2. Core declares it so no contributor depends on Reports |
| `readMeasure(id, query, actor?)` | core service | Validates, checks the ability, enforces the budget, answers ok, unavailable or unsupported |
| `listMeasures(actor?)` | core service | The figures the actor may read, with labels, units and breakdowns, for the builder and the catalogue |
| `core.person-measure` | code point | Figures per person, members-side only (tab 2, rules P1 to P8). Agreed with Integration as R3-27 |
| `readPersonMeasure(id, query, actor)` | core service | Callable only by Reports, always with an actor; audits every read without names or figures |
| `filters on core.measure` | contract change | Each figure declares the keys it honours as a filter in its manifest entry; core refuses any other (R3-27). Every contributing spec is affected, and a figure that declares none simply cannot be filtered |
| `core.measures.read-budget` | setting, advanced group | How long one read may take. Proposed 10 seconds, the same on a page and in a job |
| Shared breakdowns | core | Answered from core's tables: performance, production, season, collection (Festival-ready's collections), venue, space, day, week, month, committee year |
| `core.room-use`, `core.performances-count`, `core.capacity-scheduled` | core's own figures | Room use from the occupancy read (story C-65), agreed with Programme planning |

## The figures each module contributes

| Module | Figures (all `core.measure`) | Status |
| --- | --- | --- |
| Box office | `tickets-sold`, `tickets-comp`, `tickets-issued`, `admitted`, `capacity` (level), `capacity-filled` (ratio of issued over capacity), `gross`, `refunds`, `net`, `net-of-vat`, `orders`, `bookers` (distinct); by performance, production, season, venue, day, month, `box-office.ticket-type`, `box-office.channel` | One Box office amendment story, BO-76 (Integration ruling R3-19); door headcount figures are BO-74; Productions reads `gross`, `net-of-vat` and `tickets-sold` for royalty returns |
| Payments | `takings` by `payments.method-account` and till; `refunds-paid` | Through Integration |
| Finance | `income` and `deferred-income` from sealed postings, by production, performance and `finance.account-kind` | Through Integration; Finance's statement screen stays |
| Bar | `bar.takings`, `bar.items-sold`, `bar.wastage-value`, `bar.tabs-owed` (level); by performance, day, month, `bar.category`, `bar.price-list`, `bar.outlet` | Replaces the later point `bar.report` (change to the Bar spec, below) |
| Front of house | `shifts`, `shifts-filled`, `minutes-worked` (from `minutes_worked`), `no-shows`, `incidents` by `front-of-house.incident-kind` and severity, `volunteers` (distinct) | Through Integration; absorbs FH-45 |
| Training | `training.holders` (level, by competency), `training.lapsing`, `training.completions` (by `training.route-kind`), `training.session-attendance` (by `training.place-outcome`), `training.quiz-first-attempts`, `training.quiz-first-passes`, ratio `training.quiz-pass-rate` | Agreed with the Training (amended) thread |
| Membership | `membership.holders` (level, by scheme), `membership.joiners`, `membership.renewals`, `membership.lapsed` | Through Integration; absorbs MEM-50 |
| Communications | `communications.notices-sent`, `bounced`, `complained`, `unsubscribed` | Through Integration, later |
| Fundraising | `donations-count`, `donations-total` (by fund, campaign, channel, production, month), `gift-aid-claimable`, `gift-aid-claimed`, `campaign-raised`, `campaign-target` (level), ratio `campaign-progress`, `sponsorship-income`, `regular-givers-new`, `regular-givers-lapsed` | Agreed with the Fundraising thread |
| Productions | `tasks-overdue` (level), `show-reports-submitted`, `show-reports-late`, `licences` (level, by `productions.licence-state`), `royalty-due` (money); ready-made `productions.licensing-return` (production, by performance: tickets sold, the licence's chosen figure of gross, net or net of VAT, royalty due). Reads `box-office.admitted` for the show report's house count | Productions thread |
| Rehearsals | `calls-held`, `hours-scheduled`, `person-hours-attended`, `calls-lost-room`, ratio attendance rate | Rehearsals thread; no per-person figure |
| Governance | `documents-overdue`, `documents-lapsed` (by document kind), `feedback-open`, `posts-vacant` (all level) | Governance thread |
| Budgets and claims | `budgeted` (level), `spent`, `claims-pending` (level); ratio spend against budget | Agreed with the Budgets thread |
| Invoices and exports | `invoicing.outstanding`, `invoicing.overdue` (level), `invoicing.invoiced` | Invoices thread |
| Inventory | `items` (level), `inspections-due`, `inspections-overdue` (level), `inspections-done`, `loans-out` (level) | Proposed to the Inventory thread |
| Companies | `settlements-due`, `settlements-paid`, `guest-tickets` | Agreed with the Companies thread |
| Elections | `ballots-cast`, `eligible-voters` (level), ratio `turnout`; unsupported below the secrecy threshold | Agreed with the Elections thread |
| Programme planning | Entries by state per season, share placed (optional) | Programme planning thread |
| Festival | `festival.planners`, `festival.stars`; door headcount is Box office's (box-office.headcount-in, box-office.walk-ups, BO-74); collection is a shared breakdown | Agreed, Integration ruling R3-20 |

Figure ids are written short here; each is `<module>.<name>`.

## Figures per person

The first contributors to `core.person-measure`. Each is the module's own story; Reports owns only the point's reader.

| Figure | Module | Unit and combine | Ability (privileged, audit read) | Purpose key | Story |
| --- | --- | --- | --- | --- | --- |
| `front-of-house.minutes-worked` | Front of house | minutes, sum | `front-of-house.rota.view-people` | `front-of-house.volunteer-recognition` | FH-54 |
| `front-of-house.shifts-worked` | Front of house | count, sum | `front-of-house.rota.view-people` | `front-of-house.volunteer-recognition` | FH-54 |
| `rehearsals.person-hours-attended` | Rehearsals | minutes, sum | the module's own | `rehearsals.attendance-record` | Numbered by Rehearsals |

The ability and purpose names are proposals for those specs to confirm. Training, Membership and Productions may contribute later (hours trained, roles held), each meeting the point's entry rule in tab 2: members-side, no special-category data, a purpose in the privacy record.

## The point Reports declares

| Point | Kind | A contribution is | Used by |
| --- | --- | --- | --- |
| `reports.report` | data | `{ id, label, description, area, scope: 'none' \| 'season' \| 'collection' \| 'production' \| 'venue' \| 'space', period: <period rule>, breakdown?, figures: [measure ids], chart?, ability }`. Every figure must be declared; a figure from a module that is off is shown unavailable | Productions (licensing return), Front of house, Training, Membership, Fundraising, Box office; Reports' own cross-module ones (rule K3) |

## What Reports contributes

| Point | Contribution |
| --- | --- |
| `core.navigation-group` | `reports`, last in the console's fixed group order (Interface, shells and navigation) |
| `core.navigation` | Console: Reports, Saved copies, Schedules, Figures. Admin: Reports under Modules (settings) |
| `core.record-tab` | "Numbers" on a production and on a season: the ready-made Sales and attendance report for that record, for a person who may read it |
| `core.record-resolver` | `reports.definition`, `reports.run`, `reports.schedule` |
| `core.file-slot`, `core.file-access` | The two run slots and their access rule (tab 2) |
| `core.notification-type` | `reports.scheduled-sent` (optional, members side, topic `reports`), `reports.schedule-paused` and `reports.recipient-skipped` to the owner, `reports.run-ready` when a person's own copy finishes |
| `core.search-source`, `core.quick-action` | Saved reports in the palette; "New report" |
| `core.health-check` | `reports.schedules`: warning while a schedule has failed three times or a run has been queued for over an hour |
| `core.erasure-handler`, merge handler | Recipient rows (tab 2) |
| `core.privacy-record` | One line for schedule recipients |
| `core.role-preset` | Not a point (Integration ruling R3-11): abilities join existing preset role keys through the manifest's presets role mappings (tab 6) |
| `governance.handover-section` | `reports.pinned`: for a post and committee year, runs each pinned report and returns `{ kind: 'figures' }` blocks of its totals and a `links` block to each report. Declared by Governance with `render({ postId, committeeYear })`; Governance snapshots it when the pack is marked ready |

## Routes

| Route | Ability | Rate class |
| --- | --- | --- |
| `GET /api/reports/figures?id&from&to&scope&by` | `reports.report.view` and the figure's own | default |
| `GET /api/reports/catalogue` | `reports.report.view` | default |
| `GET, POST /api/reports/definitions`, `PATCH /api/reports/definitions/<id>` | view; create; maker or manage | default, write |
| `POST /api/reports/runs` (idempotent) | `reports.report.view` | export |
| `GET /api/reports/runs`, `GET /api/reports/runs/<id>` | `reports.run.view` | default |
| `GET, POST, PATCH /api/reports/schedules...` | `reports.schedule.manage`, or view for a schedule to oneself | write |
| `POST, DELETE /api/reports/pins` | `reports.report.manage` | write |

People reports add three routes: `GET /api/reports/people` (a live read through `readPersonMeasure`, needs `reports.people.view`), `POST /api/reports/people/runs` (keep a copy) and `GET /api/reports/people/runs/:id/csv` (made on the fly, needs `reports.people.export`). Each writes one audit row. The figures route `GET /api/reports/figures` gains an optional `filter` and `across` query, and formulas are worked out from its answer in the browser.

## Changes this asks of other specs

| Spec | Change |
| --- | --- |
| Bar | Withdraw the later point `bar.report`; Bar's figures go to `core.measure` and any ready-made bar report to `reports.report`. Bar's own reports screen and licensing sheet stay |
| Front of house | FH-45 (incident trends) is met by the ready-made Incidents report once FH contributes its figures |
| Membership | MEM-50 (joiners, renewals and retention by year) is met by the Membership report; `membershipSummary` becomes the figures' read |
| Core and Foundations | Declare `core.measure`, `readMeasure`, `listMeasures`, the setting and core's three figures; index the prefixes `rpd`, `rpr`, `rpsh`, `rpp` and the module id `reports` |
| Governance | Declare `governance.handover-section` as given above |
| Invoices and exports | Reuses the cadence columns for its own scheduled exports; runs them itself |

Nothing is open with another thread as of this draft; Integration may still rename.
