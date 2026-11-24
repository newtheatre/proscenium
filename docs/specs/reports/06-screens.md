# 5. Screens

Reports has eight console screens and one tab on other records, all in the console's Reports group (last in the fixed order). Nothing is in the public or members' areas: a member sees a report only by email link into the console, if they hold the abilities. The report page is the one that matters, and is drawn below.

## Inventory

| Screen | Address | Who sees it | Page type | What it does |
| --- | --- | --- | --- | --- |
| Reports | `/console/reports` | `reports.report.view` | List | Ready-made reports grouped by area (Box office, Front of house, Training, Money, Membership, Year in numbers), then saved reports (mine, shared with my role, all for managers). Search, archived below the divider, New by the search icon, right-click menu: open, schedule, save a copy, pin, archive |
| Report | `/console/reports/<key or id>` | view, and each figure's ability | Record-like page | Choose scope, period, breakdown and, where the report has them, the pivot and filter; headline totals; one chart; the table with a totals row; Keep a copy, Download CSV, Print, Schedule, Save a copy (ready-made) or Edit (saved) |
| New or edit report | `/console/reports/new`, `/console/reports/<id>/edit` | `reports.report.create`; maker or manage to edit | Form | The full builder (question 5). Name and kind (figures or people, people only with reports.people.view). Columns: add a figure (searchable picker grouped by module, only those the person may read) or a formula (a box that takes C1, C2 and + − × ÷, with the unit shown as it is typed); drag to reorder with @dnd-kit/vue. Rows by (only keys every figure allows), across by (shared keys only), filter (a key every figure declares, then up to 20 values), scope kind, period rule, chart, share with a role. A live preview of the first 20 rows under the form. Inline validation names the column at fault; no browser pop-ups |
| People report | `/console/reports/<id>` for a report of kind people | `reports.people.view` and each figure's ability; download needs `reports.people.export` | Record-like page | A banner, "This report shows figures about named people. Opening it is recorded." Scope and period; one row per person (name, then up to 6 figures), sorted by the first, searchable by name; the totals row; Keep a copy and Download CSV. No Schedule, Pin, Share or chart. A stale copy says "Re-run to combine merged people" (rules P1 to P8) |
| Saved copies | `/console/reports/runs` | `reports.run.view` | List | Every run the person may open: report, question, when, by whom or which schedule, state, download. Filter by report, state, schedule |
| Copy | `/console/reports/runs/<id>` | `reports.run.view` and today's figure abilities | Record page | The figures as they stood, the question in words ("Autumn 2026, 1 September to 12 December, by performance"), anything unavailable, Download CSV, Print |
| Schedules | `/console/reports/schedules` | `reports.schedule.manage`, or anyone with view for their own | List | Report, cadence in words ("Mondays at 07:00, last week"), recipients, owner, state with the pause reason, next send. Right-click: pause, resume, take over, end |
| Schedule | modal from a report or the list | as above | Modal | Cadence (dropdown), day (dropdown), time, period rule (dropdown), recipients (searchable people picker, only people who hold view), owner shown |
| Figures | `/console/reports/figures` | `reports.report.view` | List | The catalogue: every figure the person may read, its meaning (help text), unit, how it combines, its breakdowns and owner module. A successor's glossary |
| Numbers tab | on a production and a season | the figures' abilities | Record tab | The ready-made Sales and attendance report for that record, with "Open in Reports" |
| Reports settings | Admin, Modules, Reports | `reports.settings.manage` | Generated settings page | Tab 6's settings |

## Conventions it follows

- Fixed choices are dropdowns (searchable when long): period rule, cadence, breakdown, chart. Primary buttons keep the default colour.
- Period presets are relative and worked out in the theatre's days on the server: This season, Last season, This committee year, Last month, Last week, Chosen dates.
- Money shows in the theatre's locale from minor units; percentages to one decimal place; minutes as hours and minutes.
- An unavailable figure is a dash with a tooltip reason; a left-out figure is one line under the table ("2 figures are hidden because you do not have access to them").
- A chart is drawn only when the breakdown is time (day, week, month) or has at most 20 rows; otherwise the table stands alone. Every chart has a one-sentence summary read out in its place.
- Print uses the print stylesheet: A4, the question in words at the top, the theatre's name and the date printed.
- Toasts get Undo where the action can be undone (archive, pause, unpin).
- On a phone the table scrolls sideways inside its card, with the first column fixed; the page itself never scrolls sideways.
- A pivoted table puts the across key's values as grouped column headers, each figure and formula repeated under each; the totals column comes last.
- A formula column shows a small "fx" beside its label, and its tooltip spells the formula in words ("Bar takings ÷ Tickets sold").
- A filter shows as a chip above the table ("Ticket type: Member, Student") on the page, in print and at the top of every copy.

## Wireframe: the report page

_[Diagram: wireframe · report page, laptop]_

Changing any choice re-reads the figures in place and updates the address, so a link reproduces the view. Grey bars stand for values; the footnote shows how unavailable and hidden figures are told, never as nought.
