# 8. Test plan

One proof on a real D1 database, then 19 unit, 31 integration and 8 end-to-end cases. The cases that guard privacy and honest totals are marked as never to regress; a change that breaks one is refused, not re-baselined. All suites run on CI. The cases for formulas, pivots, filters and people reports were added on 24 November 2026 with Matt's answers to questions 2 and 5.

## Proof P-REP-1: a season's figures in time on D1

The design rests on modules answering aggregate reads over their own tables quickly enough for a live page. This has not been measured.

| Step | Pass when |
| --- | --- |
| Seed a real D1 database with one season of 100 performances across 12 productions, 30,000 tickets in 18,000 orders, 6,000 scans and 5,000 bar sales | Seeded by a script that refuses to run against production |
| Read `box-office.tickets-issued` scoped to the season, by performance, and by month | Each under 1 second and under 100,000 rows read, from D1's own `meta` |
| Read the ten figures of Season at a glance in parallel, as the page does | All answered within 3 seconds; none unavailable |
| Read `box-office.bookers` (distinct) by production and again for the total | Totals differ from the sum of rows where people booked twice, proving rule M6 |
| Run the same report as a bulk job with CSV and JSON files | Done within 30 seconds; files in R2; one unit of work |

If a read is too slow, the fallback is a daily summary table owned by the module itself (still its own tables, still behind `core.measure`), not a cache in Reports.

## Unit

| Case | Never regress |
| --- | --- |
| `measure answer with an account id key is refused` | Yes |
| `measure answer with text value is refused` | Yes |
| `money row without currency is refused` | Yes |
| `ratio totals from totals not from averaged rows` | Yes |
| `distinct totals are re-read never summed` | Yes |
| `level over months shows month-end level` |  |
| `two currencies never added` | Yes |
| `period presets resolve in theatre days across a clock change` |  |
| `operating day puts a 01:30 sale on the night before` |  |
| `breakdown not in by is refused before reading` |  |
| `cadence weekly monthly next due across a clock change` |  |
| `monthly on day 28 exists in February` |  |
| `csv first rows state the question in words` |  |
| `unavailable figure is an empty cell with a note row, never 0` | Yes |
| The formula parser accepts + − × ÷, brackets, whole numbers and earlier columns, and refuses functions, text, later columns and itself, naming the position (B3) | No |
| Formula units: money ± money of one currency, money ÷ count, count ÷ count as a percent pass; money + count, money of two currencies, distinct + anything are refused (B4) | Yes |
| A formula's totals row is worked out from the totals, so (a ÷ b) on the totals row is not the sum of the row results; division by nought is a dash (B5) | Yes |
| A pivot that would make more cells across than reports.builder.max-columns is refused with the count (B2) | No |
| A person row holding anything but an account id, at most one shared key and a number fails validation (core.person-measure) | Yes |

## Integration

| Case | Never regress |
| --- | --- |
| `figure hidden from a viewer without its ability` | Yes |
| `production grant reads that production's figures only` | Yes |
| `season scope refused to a production-only grant` | Yes |
| `module switched off answers unavailable not nought` | Yes |
| `read past budget answers unavailable` |  |
| `scope narrows by subquery with 500 performances (no 90-parameter failure)` | Yes |
| `box office totals equal the finance production statement` | Yes |
| `run job finishes once under a duplicate message` | Yes |
| `run over row limit fails with advice` |  |
| `copy opened after losing the ability is refused` | Yes |
| `file access follows the run's rule` | Yes |
| `expiry deletes files and keeps the row` |  |
| `schedule slot claimed once by two ticks` | Yes |
| `missed slots run once` |  |
| `recipient without an ability is skipped and owner told` | Yes |
| `owner's role ending at year end pauses the schedule` | Yes |
| `three failures pause a schedule` |  |
| `email carries headline and link, no table or file` | Yes |
| `archiving a report pauses its schedules` |  |
| `saved report keeps a switched-off module's figure as unavailable` |  |
| `erasure deletes recipient rows and pauses an emptied schedule` | Yes |
| `merge moves and de-duplicates recipients` |  |
| `handover section runs pinned reports for the committee year` |  |
| `ready-made report from another module's figures only accepted from reports (K3)` |  |
| A filter on a key the figure has not declared is refused with core.measure.filter-not-declared and the module's read is never called (M11) | Yes |
| readPersonMeasure called from any module but Reports, or without an actor, is refused (REP-41) | Yes |
| A contribution to core.person-measure without a privileged audit-read ability, a purpose key, or the members-side mark is refused at start-up (REP-41) | Yes |
| Opening a people report, keeping a copy and downloading each write exactly one audit row, with no names or figures in it (P2) | Yes |
| Staged erasure deletes the person's reports_person_rows in every copy in the same step; the copy's other rows stay (P6) | Yes |
| A merge moves person rows to the survivor and marks each touched run stale; nothing is added together (P7) | Yes |
| A people report cannot be scheduled, pinned, shared by role or emailed: each route refuses with reports.people.not-shareable, and the rows are pruned after reports.people.keep-for (P3, P5) | Yes |

## End to end

| Case |
| --- |
| `committee member opens Sales and attendance and changes the period` |
| `box office manager downloads a CSV and it matches the page` |
| `treasurer builds, saves and shares a report with the committee role` |
| `schedule sends on Monday and the link opens the copy` |
| `producer sees Numbers on their production and nothing for another` |
| `phone: the table scrolls inside its card and the page never scrolls sideways` |
| A finance officer builds a report with tickets sold and bar takings by production, months across the top, a formula for bar takings per ticket and a filter on two venues; the page, a kept copy and the CSV agree to the penny |
| A front-of-house manager granted reports.people.view opens a volunteer hours report, sees the recorded banner and no Schedule, Pin or Share; without reports.people.export there is no download, and with it the CSV carries the do-not-forward line |
