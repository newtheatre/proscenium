# 3. States and rules

Three records move: a run, a schedule and a saved report. Everything else in Reports is a read, and the rules that matter most are about reads: who may see a figure, what a figure may contain, and how figures are combined so a total is never wrong. Two groups follow Matt's answers of 24 November 2026: the builder's rules (B), for formulas, pivots and filters, and the people-report rules (P), which fence figures per person.

## Life cycles

| Record | States | Moves |
| --- | --- | --- |
| Run | queued, running, done, failed, expired, stale | queued to running when the job starts; running to done or failed; done to expired when `reports.runs.keep-for` passes (for a people run, reports.people.keep-for); a done people run to stale when a merge touches it (rule P7). No other move, and none backwards |
| Schedule | active, paused, ended | active to paused by a person or by rules S5 to S7; paused to active by a person, which works out a fresh `next_due_at`; active or paused to ended by a person. Ended is final |
| Saved report | active, archived | Either way by its maker or `reports.report.manage`. Archiving pauses its schedules and keeps its runs |

_[Diagram: life cycles · run and schedule]_

A run only ever moves forward, so a copy once done never changes; a schedule is the one record that goes back and forth.

## Reading a figure (M)

- **M1. A figure is read only through `readMeasure`.** Reports never imports another module's services for figures, and no module reads another's tables for one.
- **M2. A read holds no personal data.** Core validates every answer: a row with a key outside the figure's `by`, a non-number value, or a money row without a currency fails the read as `core.measure.bad-answer`, logged with the figure id and never the row.
- **M3. The viewer must hold the figure's ability,** site-wide or on the scope record (a grant on a production reads that production's figures, and a season scope needs a site-wide or season grant). A figure the viewer lacks is left out of the page with one line saying how many were left out, never shown as nought.
- **M4. Unavailable is not nought.** A module that is off, a read that throws, or one past `core.measures.read-budget` shows a dash and the reason ("Bar is switched off", "Took too long"), on the page, in the CSV (an empty cell and a note row) and in the email.
- **M5. Breakdowns are checked before reading.** A breakdown a figure does not allow is refused with `core.measure.unknown-breakdown`; Reports' builder offers only breakdowns every chosen figure allows.
- **M6. Totals follow `combine`.** Sum figures are totalled by adding rows. Distinct figures are totalled by a second read with one key fewer. Level figures over a period of days or months show the level at each one's end, and their total is the level at the period's end. A ratio is worked out group by group and its total from the totals, never by averaging percentages.
- **M7. Money is never added across currencies.** A money figure with more than one currency in a breakdown shows one column per currency.
- **M8. Periods are show nights.** `from` and `to` are local dates; anything that happens before `core.locale.day-start` (the show night's end) belongs to the night before. A performance's figures fall on its operating day (core's column on the performance) whatever time money moved.
- **M9. A scope narrows by subquery.** A module filters its rows with a subquery on core's tables (`performance_id IN (SELECT id FROM core_performances WHERE production_id = ?)`), never with a list of ids it was handed, so the 90-parameter chunk never bites.
- **M10. Small counts are not hidden inside the console,** where the viewer could open the records anyway. They are hidden in anything that leaves it (a shared link, later), below `reports.privacy.small-count`.
- **M11. A filter must be declared.** A figure narrows only by keys in its own `filters`; core refuses any other with `core.measure.filter-not-declared` before the module is asked, so no figure can ignore a filter and return a larger number that looks right.

_[Diagram: flow · reading one figure, rules M2 to M5]_

Each check that fails is told as what it is; none of them turns into a zero.

## Running and keeping (R)

- **R1. A page view is live, a run is a copy.** Opening a report reads each figure from the browser, in parallel, through `GET /api/reports/figures`, and keeps nothing. "Keep a copy", "Download CSV" and every schedule make a run.
- **R2. A run is a bulk job,** `reports.run-report`, so a large report can never delay a ticket email. It reads each figure, writes the CSV and JSON files through `storeFile`, and records the headline, in one unit of work.
- **R3. A run's state moves once each way,** by a conditional write naming the state it expects (`WHERE state = 'running'`), so a duplicate job message cannot finish a run twice.
- **R4. A run answers exactly its question.** The question (figures, breakdown, scope, resolved dates) is stored when it is queued; later changes to the saved report do not change an existing run.
- **R5. A run's size is capped** at `reports.runs.row-limit` rows. Past it, the run fails with `reports.run.too-large` and the page suggests a coarser breakdown or a shorter period.
- **R6. Reading a run checks today's abilities,** not the requester's then: a person who lost the ability cannot open last month's copy, and a person who gained it can.
- **R7. Expiry deletes the files** and keeps the row as `expired`, so the list still says a copy was made. A daily task, `reports.expire-runs`, works set-wise.
- **R8. Nothing is counted twice by retrying.** A failed run may be retried by a person; it makes a new run and leaves the failed one as it was.

## Schedules (S)

- **S1. Making a schedule needs `reports.schedule.manage`** to send to others; anyone who can see a report may schedule it to themselves alone. A recipient must hold `reports.report.view`.
- **S2. A slot runs once.** The task `reports.run-schedules` (every 15 minutes) claims each due schedule with `UPDATE ... SET next_due_at = <next> WHERE id = ? AND next_due_at = <due>` and `expect(1)`; only the winner queues the run.
- **S3. Missed slots are not caught up.** As the kit's tasks do, a schedule whose slot passed while the site was down runs once for the latest slot.
- **S4. A scheduled run reads as its owner.** The job reads every figure with the owner's abilities at that moment.
- **S5. Each recipient is checked when it is sent.** A recipient who no longer holds `reports.report.view` and every figure's ability for the scope is left out of that send, `skipped_at` is set, and the owner is told once.
- **S6. A schedule pauses when its owner loses the ability.** Roles end at the committee year end (31 July for NNT, `core.organisation.year-end`), so on that night most schedules pause with `owner-lost-ability`. Holders of `reports.schedule.manage` are told and can take a schedule over, which makes them its owner.
- **S7. Three failures in a row pause a schedule** with `failed-three-times`, and the owner is told.
- **S8. An email carries headline figures and a link, never the table or a file.** The link opens the run, which checks abilities again (rule R6). Matt confirmed this on 24 November 2026 (question 1).

_[Diagram: flow · one scheduled send, rules S2 and S4 to S8]_

Every "no" stops or narrows the send: abilities are checked for the owner before the run and for each recipient after it.

## Saved reports and pins (D)

- **D1. Every figure in a saved report must allow its breakdown;** saving is refused otherwise, naming the figure.
- **D2. A figure whose module is switched off stays in the saved report** and shows unavailable; it is never removed silently.
- **D3. A figure that disappears in an update** (a module withdrew it) shows "No longer offered" and the report page offers to remove it.
- **D4. Sharing is by role.** `share_role` shows the report in that role's list. Seeing it still needs `reports.report.view` and each figure's ability.
- **D5. A pin needs `reports.report.manage`** and a post that `core.record-resolver` knows. Governance's handover section runs each pinned report for the post's committee year, and Governance snapshots it when the pack is marked ready.
- **D6. A pinned or scheduled report cannot be archived** without the page saying which posts and schedules it affects, and archiving pauses those schedules (`report-archived`).

## Building a report (B)

Matt chose a full builder for the first release (question 5): columns of figures and formulas, a breakdown down the side, an optional pivot across the top and a filter.

- **B1. Columns are figures or formulas,** at most `reports.builder.max-columns` (60 by default). A figure column is a measure id; a formula column has its own label and unit.
- **B2. A pivot repeats the columns across one shared key** (`across_by`), such as each month across the top. Reports asks each figure for both keys at once and lays the answer out itself; a figure that cannot give both shows unavailable. A pivot that would make more than `reports.builder.max-columns` cells across is refused, naming how many it would make.
- **B3. A formula uses only + − × ÷, brackets, whole numbers and earlier columns** by position (`C1`, `C2`). No functions, no text, no reference to a later column, so no formula can loop. It is parsed when saved and refused with the position of the fault.
- **B4. A formula keeps units honest.** Money may be added to or taken from money in the same currency only; money ÷ count gives money per item; count ÷ count gives a percent; anything else is refused. A distinct or level column may be divided but never added to another column.
- **B5. A formula works row by row and on the totals row from the totals,** never by adding formula results, so a percent in the totals row is right. Division by nought shows a dash, not nought and not an error.
- **B6. A filter applies to every figure column.** Its key must be declared by every one (rule M11); the builder offers only keys that all chosen figures declare, and the page and every copy say what the filter was.
- **B7. A formula is worked out by Reports,** on the server for a run and in the browser for a live page, with the same parser, so a copy and the page always agree.

## Ready-made reports (K)

- **K1. A ready-made report is data from `reports.report`,** read at start-up. A module that is off contributes none, so its reports are not listed.
- **K2. A ready-made report cannot be edited.** "Save a copy" makes a saved report with `based_on` set.
- **K3. A ready-made report whose figures all belong to other modules** may be contributed only by Reports itself (the season at a glance, the committee year in numbers), so a module never presents another module's figures as its own report.

## People reports (P)

Matt asked for figures per person, such as volunteer hours, in the first release (question 2). They come only from `core.person-measure` (tab 2), and these rules hold on top of every rule above.

- **P1. Seeing one needs `reports.people.view`,** a privileged ability with audit `read`, and the figure's own ability. Neither is in any preset role except the owner; a theatre grants them on purpose.
- **P2. Every read is audited:** who, which figure, scope and period, and how many people, never the names or figures. Opening the page, keeping a copy and downloading each write one audit row.
- **P3. A people report is never scheduled, emailed, pinned or shared by role.** The builder hides those controls for `kind = people`, and the server refuses them with `reports.people.not-shareable`.
- **P4. Downloading needs `reports.people.export`.** The CSV is made on the fly from the stored rows and today's names, carries the report name, period and "Contains personal data: do not forward", and is never stored.
- **P5. Copies are kept `reports.people.keep-for`** (90 days by default), not the two years of an ordinary copy; a daily task deletes the rows and marks the run expired.
- **P6. Erasure reaches the copies.** Staged erasure deletes the person's rows in every copy in the same step that removes them from the contributing modules.
- **P7. A merge makes a copy stale,** because two rows for one person must not be added by Reports. The page says "Re-run to combine merged people".
- **P8. No formulas, pivots or filters on people.** A people report shows up to 6 figures side by side by person, sorted by the first, with at most one shared breakdown; the totals row is worked out by core's ordinary `readMeasure` where the module offers a total, never by adding the people.
