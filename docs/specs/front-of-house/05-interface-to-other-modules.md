# 4. Interface to other modules

## The manifest

| Field | Value |
| --- | --- |
| `id` | `front-of-house` |
| Kind | switchable |
| `requires` | none beyond `core` |
| `uses` | none |
| Roadmap phase | 4 |

Front of house calls no other module's services. Everything it shows from elsewhere arrives through a point that the other module contributes to, so the board and the report work, with fewer figures, in a theatre that runs no box office here.

Modules that list `front-of-house` in their own `uses`: `box-office`, `payments`, `bar`, `training`. A `uses` link may contribute to a point, listen to an event and read a fact. It may not call a service.

## Facts

| Fact | On | Standing | For |
| --- | --- | --- | --- |
| `front-of-house.on-shift` | `core.performance` | yes | Authority to work the night: scanning (BO-44), the board, checklists. Drives the on-shift bar and the Tonight menu entry (UI-05) |
| `front-of-house.leading-shift` | `core.performance` | no | Authority to run the night: check people in, record timings, extend the window, sign off |
| `front-of-house.rostered` | site | yes | Opens the members' area to someone whose only tie to the theatre is a coming shift. Grants nothing else |

These are what ID-26 maps abilities to. Suggested mappings, for the owning modules to declare and the theatre to confirm:

| Ability (owner) | Fact |
| --- | --- |
| Scan and admit at the door (Box office) | `front-of-house.on-shift` |
| See attendance for the performance (Box office) | `front-of-house.on-shift` |
| Sell at the desk, open a till (Box office, Payments) | none by default. A theatre may map it to on-shift; it is money, so it stays a role unless they choose |
| Front of house's own abilities | See part 6 |

## Points front of house offers

| Point | Kind | A contribution gives | Expected from |
| --- | --- | --- | --- |
| `front-of-house.tonight-figure` | code | `id`, `label`, `ability`, `order`, and `read(performanceId)` answering `{ value, state: ok / attention / unavailable, to? }` | Box office (agreed 16 November): sold, reserved and not yet paid (shown beside sold), admitted, still to come, remaining, and ticket takings by method. Payments: till sessions, answered by the performance's operating day, so two performances on one day show the same sessions. Bar, later |
| `front-of-house.report-section` | code | `id`, `label`, `order`, and `compile(performanceId)` answering a list of `{ label, value, unit? }` | Box office: attendance. Payments: takings by method, reconciliation state. Bar, later |

**Requirements on a duty use core's point, not one of this module's.** By Foundations' ruling of 16 November no module declares its own point for a per-person condition. Front of house is a host of `core.requirement`: it stores references as plain text on the duty, asks the kit for verdicts at the shift's call time, and owns refusal and override (part 3). It contributes no provider of its own, because its three facts already answer as requirements, referenced `fact:front-of-house.on-shift` and so on, for any host that wants "is on shift" as a condition.

Rules for contributors:

- `read` must answer within the live-data budget the interface sets; a slow or failing figure shows as unavailable.
- `compile` returns numbers and ids only. No names, no free text: the snapshot is never erased.
- A figure names the ability needed to see it. The board hides a figure the viewer may not see, so a steward does not see takings.

## Services

For modules that list `front-of-house` in `requires`. None does in the first release.

| Service | Answers |
| --- | --- |
| `shiftsFor(accountId, range)` | The person's assignments with shift, duty, times and state |
| `onShiftNow(performanceId)` | Accounts for whom on-shift holds, with duty and whether leading |
| `hoursWorked({ from, to, accountId?, dutyId? })` | Minutes worked, grouped as asked |

## Events

Events carry ids only.

| Event | Internal | Carries | When |
| --- | --- | --- | --- |
| `front-of-house.shift.published` | no | shift, performance | A shift opens to members |
| `front-of-house.shift.cancelled` | no | shift, performance |  |
| `front-of-house.assignment.confirmed` | yes | assignment, shift, account |  |
| `front-of-house.assignment.released` | yes | assignment, shift, account | Released, withdrawn, declined or removed; the state is on the record |
| `front-of-house.assignment.worked` | yes | assignment, shift, account | At sign-off. Training or Membership may count it |
| `front-of-house.checklist-run.completed` | no | run, performance |  |
| `front-of-house.incident.reported` | yes | incident | Never offered to webhooks |
| `front-of-house.incident.closed` | yes | incident |  |
| `front-of-house.night-report.signed-off` | no | report, performance | Nothing financial waits on it: income is recognised on core.performance.completed and a till closes by its own cash-up, so a forgotten signature never holds up the books |

Events about a person or about welfare are internal, as Foundations requires.

## Events front of house listens to

| Event (core) | What happens |
| --- | --- |
| `core.performance.rescheduled` | Shift times and windows recomputed from the new time; people told |
| `core.performance.cancelled` | Shifts cancelled; assignments released; people told |
| `core.performance.moved` | `venue_id` copied to the shifts; the default rota template is not reapplied; people told of the new place |
| `core.performance.scheduled` with reinstated set | Nothing automatic: cancelled shifts stay cancelled, and the console card "Shifts unfilled" shows the performance so a manager applies a rota template again |

The names are as Core domain's part 4 declares them, confirmed on 16 November.

## Tasks

| Task | When | Lane | Does |
| --- | --- | --- | --- |
| `front-of-house.remind-shifts` | every 15 minutes | prompt | Sends due reminders |
| `front-of-house.close-shifts` | every 15 minutes | bulk | Completes shifts past their window; resolves shifts with no performance; once a day runs the retention sweep |
| `front-of-house.chase-night-reports` | daily at 10:00 | bulk | Tells managers about unsigned reports |
| `front-of-house.chase-actions` | daily at 09:00 | bulk | Reminds action owners; sends the incident digest |

## Record types

| Record type | Parent | Owner |
| --- | --- | --- |
| `front-of-house.shift` | `core.performance` | none |
| `front-of-house.assignment` | `front-of-house.shift` | `account_id` |
| `front-of-house.checklist-run` | `core.performance` | none |
| `front-of-house.incident` | none | `reported_by` |
| `front-of-house.night-report` | `core.performance` | none |

An ability granted on a production or a performance therefore reaches its shifts, runs and report.

## Contributions to core points

| Point | What front of house contributes |
| --- | --- |
| `core.navigation` | Members: Shifts. Console, group Front of house: Rota, Incidents, Night reports, Volunteer hours (everyday); Duties, Rota templates, Checklists, Emergency cards, Settings (set-up). Live pages are reached from Tonight tiles, not from a menu. Entries use Foundations' menu field |
| `core.home-card` | Members' home: "Your next shift", "Cover needed". Console home: "Shifts unfilled this week", "Incidents awaiting review", "Reports not signed off", "Actions overdue". Tonight, through core.tonight-tile: a "Front of house" section with tiles for people, checklists and the incident report. Each names an ability, never a fact (the on-shift fact grants those abilities), for example `front-of-house.shift.view` |
| The on-shift bar, `core.on-shift-bar` (confirmed by Interface, 16 November) | For a viewer on shift: performance id, a label key with duty, performance title and call time, and `until` |
| `core.record-tab` | "Rota" on a performance and on a production; "Night report" on a performance |
| `core.account-section` | None. Shifts live in the members' area, not My account |
| `core.search-source` | Incidents by number (for holders of incident.view); people on tonight's rota (for someone leading) |
| `core.quick-action` | "Report an incident", for anyone who holds the ability |
| `core.setup-step` | "Set up front of house": duties, a rota template, a pre-show checklist, the emergency card, and confirming what leading a shift may do |
| `core.health-check` | The close-shifts task ran in the last hour; every venue with performances has an emergency card reviewed within the period; no incident is past its review time |
| `core.record-resolver` | Titles and addresses for its five record types |
| `core.change-impact` | For a performance: "6 shifts, 9 people confirmed". Not a change guard: a rota never blocks a change to the programme |
| `core.notification-type` | See below |
| `core.notification-topic` | "Shifts open for sign-up", "Cover needed", "Night reports" |
| `core.vocabulary` | `front-of-house.incident-category` (slip or fall, illness, behaviour, fire alarm, building, lost child, other), `front-of-house.exception-reason` (broken, missing, not safe, no time, other). Theatres edit both |
| `core.erasure-hold`, `core.erasure-handler`, `core.export-contributor`, `core.merge-handler` | As in part 3. The merge handler keeps one assignment when two accounts on the same shift become one |
| `core.privacy-record` | Rota and volunteer hours (legitimate interests); incident records (legal obligation and vital interests), with the retention periods |
| `forms.slot` | `front-of-house.incident-details`, later: a theatre's own extra questions on an incident |

## Notification types

All go through core's notification service, inside the unit of work that causes them.

| Type | To | Transactional |
| --- | --- | --- |
| Shift confirmed | the person | yes |
| Shift reminder | the person | yes |
| Shift changed or cancelled | the person | yes |
| You were removed from a shift | the person | yes |
| Cover needed | eligible members following the topic; managers | no |
| Cover taken | the person released | yes |
| Incident reported | holders of incident.manage | yes |
| Action assigned, action overdue | the owner | yes |
| Night report ready | holders of night-report.view following the topic | no |
| Night report not signed off | managers | yes |

No notification carries what happened in an incident, a person's name from one, or a welfare detail.

## Addresses and routes

Pages: `/members/front-of-house/...`, `/console/front-of-house/...`, `/live/front-of-house/...`. API: `/api/front-of-house/...`. Every writing route used in live mode is idempotent. Reporting an incident, entering a checklist item, checking in and recording a timing are the queued writes.

## What front of house needs from others

| From | What | State |
| --- | --- | --- |
| Foundations | The `unlinked: 'staff'` subject form; sixteen prefixes | Ruled and registered, 16 November |
| Identity | Facts as standings; `holdersOf`; the welfare-lead preset role; the data-request screen listing unlinked tables | Agreed |
| Core domain | Performance times and expected end; rescheduled and cancelled events; vocabularies; notifications | Confirmed |
| Interface | The point for the on-shift bar; `gate` on Tonight tiles; live mode and queued writes | Confirmed 16 November: core.on-shift-bar and core.tonight-tile |
| Box office | Contributions to `tonight-figure` and `report-section`; the scan ability mapped to on-shift | Agreed; the named access list stays on Box office's screen at /live/door |
| Payments | Contributions to the same two points | Agreed |

## Access needs and emergency contacts

Both belong to Identity (its part 3). Front of house stores neither.

- **Tonight's house.** Front of house does not read Identity's access profile. Box office copies needs onto the order at booking and contributes a count per need (including whether a wheelchair stays or is stored) to `front-of-house.tonight-figure` ("Access needs: 3"), linking to its own access list for those who hold its ability to open it. Front of house does not call Box office's access service, because it has no link to that module. No names or needs are stored here or copied into the night report.
- **Volunteers on a shift.** Not read in the first release. If a theatre wants a manager to see a volunteer's access needs when building a rota, front of house will declare a members' purpose, `front-of-house.shift`, through `core.access-purpose`, which the person switches on. That is a later story and is not counted in part 7.
- **Emergency contacts.** Front of house stores none and never copies one into an incident. Someone handling an incident reads a member's contact through Identity, one person at a time, with a reason code, under `core.emergency-contact.read`. A theatre may map that ability to `front-of-house.leading-shift`; because it is privileged, the theatre must confirm the mapping. One at a time is enough on the night: no list for a whole shift is needed.
