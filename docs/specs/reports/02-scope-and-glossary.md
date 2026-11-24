# 1. Scope and glossary

Reports puts figures from several modules side by side, keeps copies, sends them on a schedule and lets people download them. It owns no figure: each module says what its own figures mean through the kit point `core.measure`, and Reports only asks.

## In

| Area | First release | Later |
| --- | --- | --- |
| The figures point | `core.measure` (declared by core, contract in tab 2) and core's service `readMeasure`, so any module can read a figure without Reports switched on | Comparing a figure with the same point last season |
| Ready-made reports | The ones listed under "Ready-made reports" below, contributed by modules through `reports.report` | Booking pace against earlier productions |
| A theatre's own reports | A full builder (question 5): figures and formula columns, a breakdown down the side, a pivot across the top, a declared filter, a scope and a period; save, share with a role, archive | Comparison with last season or the previous period (REP-31); booking pace (REP-32) |
| Copies | A run keeps a report's figures as they stood, with a CSV file, for a set time | A PDF made by the server; today the page prints |
| Schedules | Weekly, monthly, at the end of a season or a committee year, to named people who hold the abilities; email with headline figures and a link | After each production's last performance |
| Figures catalogue | Every figure the site can answer, with what it means, who owns it and how it breaks down |  |
| Pins | A saved report pinned to a committee post, shown in that post's handover pack through Governance |  |
| Per-person totals | People reports (question 2): volunteer hours and shifts by person from Front of house and Rehearsals, through core.person-measure; privileged, audited on every read, never scheduled, emailed, pinned or shared, copies kept 90 days and erased with the person | Further members-side contributors (hours trained, roles held), each meeting the point's entry rule |
| Sharing outside | Download the CSV and send it yourself | A link to a copy for a funder or rights holder, expiring (question 3) |

## Out

- **Each module's own working lists and screens.** Bar's reports screen and licensing sheet, Finance's production statement and reconciliation, Front of house's night report, Box office's door figures stay where they are. Reports draws on the same figures, never a second copy of the logic.
- **Accounting exports.** Ledger CSVs, the parent body's format and invoices are Invoices and exports (spec 9, module `invoicing`), agreed with that thread on 23 November 2026. Reports never exports ledger entries.
- **Royalty calculation and licence tracking.** Productions (spec 4) owns the licence, the royalty basis and whether a return was sent. Reports draws its licensing return as a ready-made report.
- **Election results.** Elections (spec 7) owns counts; Reports shows only turnout, never a breakdown that could reveal a ballot.
- **Dashboards on home pages.** The console home's figures stay `core.home-figure`, and the Tonight board's stay `front-of-house.tonight-figure`. A later story may let a home figure read a measure.
- **Anything personal.** No names, emails, account ids or free text ever appear in a figure, a copy, a file or an email.

## What Reports assumes of other modules

| Module | Assumed |
| --- | --- |
| Core | Declares `core.measure` and `readMeasure`; answers the shared breakdowns (performance, production, season, collection, venue, space, day, week, month, committee year) from its own tables; contributes `core.room-use` from the occupancy read (story C-65, agreed with Programme planning); `core.organisation.year-end` gives the committee year; files in R2 through a server file slot; `notify()` for schedule emails |
| Box office | Contributes tickets sold, comps, admitted, capacity, gross, refunds, net and net of VAT, by performance and ticket type |
| Payments and Finance | Finance contributes income by account kind from sealed postings, by production and performance |
| Front of house | Contributes shifts filled, hours worked, no-shows and incidents by kind |
| Every other module | Contributes its own figures (tab 4 lists what each agreed). A module that is off answers nothing and its figures are hidden |
| Identity | Abilities on a production or season grant reading that record's figures; roles end at the committee year end, which pauses schedules (rule S6) |
| Governance | Declares `governance.handover-section`, to which Reports contributes the pinned reports |
| Practice mode | Practice data lives in a separate store, so no real figure can count it (agreed 23 November 2026) |

## Ready-made reports in the first release

| Report | Scope | Rows | Figures | Contributed by |
| --- | --- | --- | --- | --- |
| Sales and attendance | Production, season or period | Performance | Tickets sold, comps, admitted, capacity, capacity filled, gross, net | Box office |
| Season at a glance | Season | Production | As above, plus bar takings and room use | Reports, from Box office, Bar and core |
| Volunteers | Season or period | Month or duty | Shifts filled, unfilled, hours worked, no-shows | Front of house |
| Incidents | Season or period | Month or kind | Incidents by kind and severity | Front of house (absorbs FH-45, incident trends) |
| Training | Committee year | Competency | People holding, lapsing in the period, completions by route | Training |
| Membership | Committee year | Scheme or month | Members holding, joiners, renewals, lapsed | Membership (absorbs MEM-50) |
| Per-show finance | Production | Account kind | Ticket income, bar income, refunds, budget, spend, settlements | Finance, with Budgets and Companies when on |
| Room use | Period | Space | Hours open, hours booked, hours performing, room use | Core and Spaces |
| Committee year in numbers | Committee year | Area | One headline per module | Reports |
| Licensing return | Production | Performance | Tickets, gross, royalty due | Productions |

## Glossary of the words Reports owns

| Word | Meaning |
| --- | --- |
| Figure | A number a module can work out for a period and scope, declared once through `core.measure`. In code, a measure |
| Breakdown | What a figure is split by: a shared key (performance, month) or the module's own (ticket type) |
| Scope | The one record a report is about (a season, a production, a venue) or none, beside its period |
| Period | Two local dates, inclusive, counted in show nights (the night runs to the rollover hour) |
| Report | A choice of figures, a breakdown, a scope rule and a period rule. Ready-made reports come from modules; saved reports are the theatre's |
| Run | One working-out of a report, kept with its CSV: a copy of the figures as they stood |
| Schedule | A rule that runs a report and sends it to named people |
| Pin | A saved report attached to a committee post, for its handover pack |
| Capacity filled | Tickets issued (sold and comps) against capacity, as a percentage. Ruled with Integration on 23 November 2026 so that "occupancy" stays Programme planning's word for the view of spaces over time |
| Room use | Hours a space is booked or performing against the hours it is open |
| Admitted | Tickets scanned or marked in at the door. Shown beside tickets issued, never instead (question 4) |
| Unavailable | A figure whose module is off, failed or was too slow. Shown as a dash with a reason, never as nought |

Words used but not owned: performance, production, season, collection and venue (core); committee year (identity); duty and shift (Front of house); competency and route (Training).
