# 4. Interface to other modules

Rehearsals requires Productions, Spaces, Availability (Integration ruling R3-26) and the support module Occupancy, declares no point of its own, and reaches everything else through services, events and contributions in Foundations' formats. Every name it relies on from another spec was agreed with that spec's thread on 23 November 2026 (table at the end).

## The module

| Module | Id | Requires | Uses | Can be switched off | Owns |
| --- | --- | --- | --- | --- | --- |
| Rehearsals | `rehearsals` | `productions`, `spaces`, occupancy, availability | nothing | Yes | The ten tables in part 2 |

```ts
// layers/rehearsals/module.ts
export default defineModule({
  id: 'rehearsals',
  manifest: 1,
  since: '0.x.0',
  stability: 'experimental',
  requires: ['productions', 'spaces', 'occupancy', 'availability'],
  uses: [],

  settings, abilities, records, tables, vocabularies,

  events: {
    announces: { /* the table below */ },
    listens: {
      'spaces.booking.confirmed':          'room-changed',
      'spaces.booking.declined':           'room-changed',
      'spaces.booking.expired':            'room-changed',
      'spaces.booking.bumped':             'room-changed',
      'spaces.booking.cancelled':          'room-changed',
      'spaces.booking.changed':            'room-changed',
      'productions.team-member.left':      'team-member-left',
      'core.production.cancelled':         'production-ended',
      'core.production.withdrawn':         'production-ended',
    },
  },

  tasks: {
    'rehearsals.sweep': task({ every: '15m' }),
    'rehearsals.retention': task({ dailyAt: '03:30' }),
  },

  contributes: { /* the table below */ },
  presets: { /* part 6 */ },
})
```

The `since` version waits for the roadmap. No job is needed: the largest write is one sheet publishing a week of calls (tens of rows) and telling their people (tens to low hundreds), each set-wise inside one unit, well under `core.units.set-rows-limit`.

## Record types

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `rehearsals.schedule` | `rehearsals_schedules` | `core.production` | none |
| `rehearsals.call` | `rehearsals_calls` | `rehearsals.schedule` | none |
| `rehearsals.report` | `rehearsals_reports` | `rehearsals.call` | none |

So a grant on a production reaches its schedule, calls and reports: "stage manager of Hamlet" is one grant, and Productions' facts on `core.production` reach the same records. `rehearsals.call` is also the origin type Spaces stores on the room booking, and its resolver gives the booking page its "managed by" link.

## Services

Named exports of `layers/rehearsals/server/services.ts`, imported as `#modules/rehearsals` by a module that lists `rehearsals` in `requires`. None writes; none is needed by another spec in this round today.

| Service | Returns |
| --- | --- |
| `getSchedule(productionId)` | The schedule, or null |
| `listCalls({ productionId, from, to, states })` | Calls in time order, each with kind, times, place or bookable, room state |
| `callsFor(accountId, { from, to })` | One person's published calls with their own call time, in account scope |
| `getCall(id)` | One call with its running order |

## What Rehearsals calls

| Owner | Name | Used for |
| --- | --- | --- |
| Productions | `listTeam(productionId, { includeLeft })` | Who may be called (rule C5), the unit grid, the free view, report recipients and department leads |
| Productions | facts `productions.team-member`, `productions.team-lead` on `core.production` | Presets (part 6) and rule V2 |
| Productions | core vocabulary core`.department` | Report notes (rule R1) |
| Spaces | `requestBooking`, `changeBookingOfOrigin`, `cancelBookingsOfOrigin`, `bookingOfOrigin`, `checkRequest`, `listBookables` | Rules B1 to B3 and the room picker |
| Programme planning | occupancy module's service `occupancy({ spaceIds, from, to })` | The room column of the planner: what else is in a room that week |
| Availability | `openRequest, closeRequest, levels(accountIds or group, from, to, viewerId)` | Asking the team for availability (rule F1) and the planner's free, maybe and busy blocks (rule F2), one call per week shown |
| Core | `personsBusy(accountIds, from, to)` (Festival-ready story C-66) | Rule W3 and the free view |
| Core | `getProduction`, `getSpace`, `placeName`, `notify`, `findAccounts` | Labels, places, messages |

## Events Rehearsals announces

Payloads carry ids and times, never names or free text. All carry `callId` and `productionId` unless noted. All are version 1.

| Event | When | Payload beyond those two |
| --- | --- | --- |
| `rehearsals.call.published` | A call moves to Published, alone or in a sheet | `kindSlug`, `startsAt`, `endsAt`, `sheetId` if any |
| `rehearsals.call.changed` | A published call changes (rule N1) | `kindSlug`, `version`, old and new `startsAt`, `endsAt` |
| `rehearsals.call.cancelled` | The move happens | `kindSlug` |
| `rehearsals.call.done` | The sweep marks it | `kindSlug` |
| `rehearsals.call.room-lost` | `room_state` becomes `lost` | The reason |
| `rehearsals.sheet.issued` | A call sheet is issued | `sheetId`, `coversFrom`, `coversTo`, no `callId` |
| `rehearsals.report.sent` | A report is sent | `reportId` |

Productions listens for `published` and `cancelled` to tick and reopen milestones that name a kind (`a template milestone written call:technical`).

## Events Rehearsals listens for

| Event | From | What Rehearsals does |
| --- | --- | --- |
| `spaces.booking.*` (confirmed, declined, expired, bumped, cancelled, changed) | Spaces | Rule B4, only for bookings whose origin is `rehearsals.call` |
| `productions.team-member.left` | Productions | Rule U3 |
| `core.production.cancelled`, `core.production.withdrawn` | Core | Rule L1 |
| `core.account.merged` | Identity | Nothing: every account column is alias. Listed so the dependency is visible |

Every listener acts only on rows still in the state it expects, so running twice changes nothing.

## Points Rehearsals offers

None. A condition on a person (a fight call needing a current stage combat certificate, say) would be a requirement through `core.requirement`; that is a later story (RH-46), not a point of this module.

## What Rehearsals contributes

| Point | Owner | Contribution |
| --- | --- | --- |
| `core.person-busy` | Core (Festival-ready C-66) | For accounts and a window: each published call they are called to (`firm` true, label "Rehearsal" or the kind). Stated busy time is Availability's own contribution (R3-26), not Rehearsals' (`firm` false, "Unavailable", no reason). Nothing about anyone else |
| `availability.group` | Availability | Each unit as a group, id rehearsals.unit:\<id>, label the unit's number and name, members its people, canPlan true for schedule managers (rule F3) |
| `availability.target` | Availability | "Rehearsal call": a slot from Find a time opens a draft call with the slot, people and title filled in, for schedule managers only (rule F3) |
| `core.person-measure` | Core; read by Reports (R3-27) | rehearsals.person-hours-attended: rows { person, value }, combined by sum, where value is the hours of each call the person was marked present or late at. Only where attendance is switched on (RH-41); nothing otherwise. Declares the privileged ability rehearsals.person-hours.read, audited as a read with a purpose key; only Reports reads it (RH-51). RH-43's aggregate figures stay later |
| `productions.schedule-entry` | Productions | Published calls of a production in a window, with kind, title and link, so they sit beside milestones on the production timeline |
| `core.measure` | Reports | Aggregates only: `rehearsals.calls-held`, `rehearsals.hours-scheduled` (minutes), `rehearsals.person-hours-attended` (minutes, where attendance is taken), `rehearsals.calls-lost-room`, and the attendance rate (attended over called person-hours), by production and month. No per-person rows (Reports' ruling) |
| `core.upcoming` | Core | A person's next calls on My account's Upcoming card: "Rehearsal, Hamlet, 19:00, Studio 1" |
| `core.home-card` | Interface | Members' home: "Your rehearsals this week". For schedule managers: "Rehearsals to sort" (lost rooms, people who cannot come, drafts not issued) |
| `core.record-tab` | Interface | A "Rehearsals" tab on the console record page of a production, for room managers |
| `core.record-resolver` | Foundations | `rehearsals.schedule`, `rehearsals.call`, `rehearsals.``report`: label, address, parent |
| `core.erasure-handler` | Foundations | Part 2's erasure: future call rows removed, past rows anonymised; availability is erased by Availability |
| `core.export-contributor` | Identity | A person's calls, responses, and attendance in their data download |
| `core.privacy-record` | Foundations | "Rehearsals: which rehearsals you were called to, whether you said you could come and whether you came. Attendance is deleted after the retention period" |
| `core.navigation` | Foundations | Part 5's entries |
| `core.notification-topic`, `core.notification-type` | Core | Below |
| `core.health-check` | Foundations | A published call within 24 hours with its room still requested or lost; a call with nobody called; a schedule with no manager |
| `core.count` | Core | `rehearsals.to-sort` for the managers' home card |
| `core.setup-step` | Foundations | "Check the call kinds and the room purpose each uses", not required |
| vocabulary `rehearsals.call-kind` | Core | Declared by this module, with the starting terms in part 6 |

Also to Productions' point `productions.workspace-tab` (the shape of `core.record-tab`: id, ability, component, order, count): the "Rehearsals" tab of the members-side production workspace, ability `rehearsals.schedule.read`, with the count of calls to sort for managers. This is where stage managers work; the console tab is only for room managers.

And to core's `core.calendar-feed` (story C-70, written in spec 15; ruling R3-12) as `{ id: "rehearsals", events(accountId, from, to) }`. For that account it returns each published call it is in, between `from` and `to`, as `{ key, startsAt, endsAt, title, location, status }`: `key` is the call's id alone, never its version, because core builds the event's UID from it: a changed time updates the same event, keeping people's reminders and replies (the version can go in a sequence number if C-70 later carries one); `startsAt` and `endsAt` are the person's own call times; `title` is public-safe, the production's title and the call kind only ("Macbeth: blocking rehearsal"), never notes, reasons or other people's names; `location` is the room's public name; `status` is cancelled for a cancelled call and confirmed otherwise. Drafts are never listed. `allDay` and `transparent` are not set. Rehearsals keeps no feed table, token or route; core owns them.

### Notification topic and types

One topic, `rehearsals.calls`, side `members`, labelled "Rehearsal calls". Email and inbox allowed for all.

| Type | Category | Sent to | When |
| --- | --- | --- | --- |
| `rehearsals.sheet.yours` | Transactional | Each person called in the window | A sheet is issued (rule S2) |
| `rehearsals.call.yours` | Transactional | The people called | One call is published alone (rule S4) |
| `rehearsals.call.changed` | Transactional | The people affected | Rule N2; urgent within short notice (N3) |
| `rehearsals.call.cancelled` | Transactional | The people called | A published call is cancelled, with the note |
| `rehearsals.call.uncalled` | Transactional | A person removed from a published call | Rule N2 |
| `rehearsals.call.reminder` | Optional | Each person called | Rule N4 |
| `rehearsals.call.confirm-nudge` | Optional | A person with no response | Rule A2 |
| `rehearsals.manager.room-lost` | Transactional | The schedule's managers | Rule B5 |
| `rehearsals.manager.cannot-come` | Optional, may join a digest | The schedule's managers | Rule A1 |
| `rehearsals.report.sent` | Optional | Rule R2's recipients | A report or an addition is sent |

Managers are reached through `notifyHolders` on `rehearsals.schedule.manage` for the production, so a grant or Productions' lead fact both work.

## Routes

All under `/api/rehearsals/`, written with `defineRoute`. None is public, and there is no feed route: the calendar feed is core's (C-70).

| Route | Ability | Purpose |
| --- | --- | --- |
| `GET /api/rehearsals/productions/<id>/schedule` | `rehearsals.schedule.view`, or team member for published calls | The schedule and calls in a window, shaped by V1 to V3 |
| `PUT /api/rehearsals/productions/<id>/schedule` | `rehearsals.schedule.manage` | Period and defaults |
| `GET`, `POST`, `PATCH`, `DELETE` `/api/rehearsals/productions/<id>/units…` | view to read, manage to write | The breakdown and who is in each unit |
| `POST /api/rehearsals/calls`, `PATCH /api/rehearsals/calls/<id>` | `rehearsals.schedule.manage` | Make or change a call, with its room and people. Idempotent |
| `POST /api/rehearsals/calls/check` | `rehearsals.schedule.manage` | Warnings and Spaces' `checkRequest`, without writing, as the manager types |
| `POST /api/rehearsals/calls/<id>/publish`, `/cancel`, `DELETE /api/rehearsals/calls/<id>` | `rehearsals.schedule.manage` | S4, cancelling, deleting a draft |
| `POST /api/rehearsals/productions/<id>/sheets` | `rehearsals.schedule.manage` | Issue a call sheet (S1). Idempotent |
| `GET /api/rehearsals/productions/<id>/free?from=&to=` | `rehearsals.schedule.view` | The free view: Availability's levels and other commitments, reasons only where shared and allowed. At most 31 days |
| `GET /api/rehearsals/me/calls`, `POST /api/rehearsals/me/calls/<id>/response` | Signed in, own rows only | V1 and A1 |
| `PUT /api/rehearsals/calls/<id>/attendance` | `rehearsals.schedule.manage` | A4, set-wise |
| `GET`, `PUT`, `POST …/send` `/api/rehearsals/calls/<id>/report` | view to read, manage to write and send | R1 to R3 |
| `POST /api/rehearsals/report-notes/<id>/done` | team member in the note's department, or manage | R3 |
| `No feed route` | The token | The feed is core's (ruling R3-12) |
| `No reset route` | Signed in | Core resets the feed's token |

## Index of names

For Foundations' index, to be registered by the Integration pass.

| Kind | Names |
| --- | --- |
| Module id, table prefix, story prefix | `rehearsals`, `rehearsals_`, RH |
| Id prefixes, all time-sorted | `rhsd` schedules, `rhun` units, `rhcl` calls, `rhcp` call people, `rhsh` sheets, `rhrp` reports, `rhrn` report notes |
| Keyed by their own columns | `rehearsals_unit_people`, `rehearsals_call_units` |
| Record types | `rehearsals.schedule`, `rehearsals.call`, `rehearsals.``report` |
| Points declared | none |
| Facts | none |
| Vocabulary | `rehearsals.call-kind` |
| Notification topic | `rehearsals.calls` |
| Refusal codes | `rehearsals.not-on-team`, `rehearsals.room` (with Spaces' code inside), `rehearsals.rule` (with the rule id), `rehearsals.closed` |
| Tasks | `rehearsals.sweep`, `rehearsals.retention` |
| Counts | `rehearsals.to-sort` |
| Measures | `rehearsals.calls-held`, `rehearsals.hours-scheduled`, `rehearsals.person-hours-attended`, `rehearsals.calls-lost-room`, `rehearsals.attendance-rate` |

Eight id prefixes; the two keyed tables need none. Requiring Productions and Spaces is recorded as Integration ruling R3-01.

## Agreed with the other specs

| With | Agreed | Where it shows |
| --- | --- | --- |
| Productions | Productions owns the team (`productions_team_members`), positions and departments; Rehearsals requires it and calls `listTeam`. Facts `productions.team-member` and `productions.team-lead` on `core.production`. Rehearsals contributes to `productions.schedule-entry`. Milestones tick on `rehearsals.call.published` by kind slug and reopen on `cancelled`. The team events productions.team-member.left and .added carry teamMemberId, productionId, accountId and positionId; left is announced when the leaving date is typed, even for a future date. A department with no lead falls back to the production's leads. Rehearsal reports stay Rehearsals', alike in shape to show reports, using `core.department (core's since Integration's provisional ruling)` | Rules C5, U2, U3, R1, R2; part 6 presets |
| Spaces | No change asked. Rehearsals is the caller its part 4 already describes (its story SP-37): origin bookings in the caller's unit, `booked_for` chosen by the caller, rules applied as for anyone | Rules B1 to B7 |
| Programme planning | It places performances and the get-ins and changeovers that belong to them; every rehearsal call, technical and dress included, is Rehearsals' through Spaces. `Occupancy is a support module, occupancy, with no switch (Matt, ruling R3-03); Rehearsals requires it and its service` feeds the planner's room column. It reads people's commitments through `core.person-busy` | Scope; part 5 |
| Festival-ready changes | Core point `core.person-busy`, story C-66: contributors answer for given accounts and a window, advisory only; account ids by subquery or chunked at 90. Rehearsals contributes published calls only; stated busy time comes from Availability (R3-26, amending R3-04) | Rules W3, F3 |
| Availability | Agreed 23 November 2026 (Integration ruling R3-26). Availability owns stated availability, its reasons, sharing, retention and erasure. Rehearsals opens and closes one request per schedule (sourceRef rehearsals.schedule:\<id>; closing stops reminders only), reads levels() for a whole team and week by group or by account ids chunked at 90, and contributes units to availability.group and a "Rehearsal call" target. The former question 4 on reasons is now Availability's question | Rules F1 to F3, W2 |
| Reports | Contribute to the kit point `core.measure`, aggregates only. A cross-module per-person volunteer-hours total is Reports' later story, not this module's | The contributions table |

### Still open

| # | With | Open point | Until settled |
| --- | --- | --- | --- |
| 1 | Productions | C`losed: the team-member events were confirmed by Productions on 23 November 2026` | Written into rule U3 |
| 2 | Integration | Taken up as ruling R3-12 and written in spec 15: one personal calendar feed owned by core, core.calendar-feed (story C-70) | `Written in: no feed table; Rehearsals contributes published calls to core.calendar-feed` |
| 3 | Interface | Whether the planner reuses the shared Calendar component (UI-35) with people as a second axis, or is its own grid | Part 5 assumes UI-35 for the week view and its own grid for the unit breakdown |
| 4 | Integration | Under-18 members: ruling R3-25, assumed until Matt answers its question 10. Core's ageStatus(person, on) answers under-18 or unknown from the one date Identity holds, the day a person turns 18 (story C-74); Rehearsals never reads the date | Written into W6, W7, RH-50 and U-11; the marker shows only to people who run calls and never in exports; no parental contact |

**Settled**** with Productions****, 23 November 2026: room bookings in a team member's name****.** Spaces opens its rehearsal purposes only to holders of core's `core.production-team`, which comes from credits. Productions keeps a core credit for every current team member (hidden when they are not publicly credited), so the fact holds for the whole team with no change to core, and rule B1's booking in the actor's name passes Spaces' rule P2.
