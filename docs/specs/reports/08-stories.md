# 7. Stories

Forty-five stories, REP-01 to REP-45 (a new prefix, REP, unused elsewhere): 5 gate, 32 first release, 8 later. The gate proves both figures points on D1, with Box office's figures and a test contributor of figures per person, before anything else is built; the first release then adds modules' figures one by one, so Reports is useful from the first contributing module. Matt's answers of 24 November 2026 brought the full builder (REP-33, REP-42, REP-43) and people reports (REP-35, REP-41, REP-44, REP-45) into the first release.

## Gate

| Id | Story | Acceptance criteria |
| --- | --- | --- |
| REP-01 | As a module author I declare a figure once and any module can read it | `core.measure` accepts a contribution only with label, unit, combine, by and ability; `readMeasure` answers ok, unavailable (module off, throws, past `core.measures.read-budget`) or unsupported; an answer with a key outside `by`, a non-number or money without currency fails as `core.measure.bad-answer` and the row is not logged; a ratio is divided group by group; an actor without the ability on the scope record is refused. Core's story, numbered here until Integration places it |
| REP-02 | As a box office manager I see tickets and money for any performance, production or season | Box office contributes `tickets-sold`, `tickets-comp`, `tickets-issued`, `admitted`, `capacity`, `capacity-filled`, `gross`, `refunds`, `net`, `net-of-vat` with the breakdowns in tab 4; every scope narrows by a subquery on core's tables; totals match the production statement for the same production to the penny |
| REP-03 | As the maintainer I know a season's figures answer in time on D1 | Proof P-REP-1 (tab 8) passes and its write-up is in the project files |
| REP-04 | As a committee member I open Reports and see Sales and attendance for a production | The Reports group shows ready-made reports from `reports.report`; the report page reads each figure live and in parallel; nothing is written |
| REP-41 | Figures per person have their own fenced point | Core declares core.person-measure and readPersonMeasure (R3-27). Registration refuses a contribution without a privileged ability with audit read, without a purpose key in the privacy record, or not marked members-side. Any caller but Reports is refused. A row with a name, email or text fails the read. Every read writes one audit row without names or figures. Proved with a test contributor on D1 |

## First release

| Id | Story | Acceptance criteria |
| --- | --- | --- |
| REP-05 | I choose the scope, period and breakdown | Presets worked out in the theatre's days on the server; the address carries every choice and reproduces the view; a breakdown a figure does not allow is not offered |
| REP-06 | Totals are right whatever the figure | Sum figures add; distinct figures re-read with one key fewer; level figures show the level at the period's end; ratios total from totals; money in two currencies shows two columns (rules M6, M7) |
| REP-07 | I see a chart where one helps | Drawn for a time breakdown or at most 20 rows; one-sentence summary for screen readers; none otherwise |
| REP-08 | I am never misled by a missing figure | Unavailable figures show a dash and a reason; hidden figures are counted in one line; neither is ever nought, on the page, in a CSV or in an email |
| REP-09 | I download a report as a CSV | Makes a run through the bulk job; idempotent; the file has the question in words in its first rows and a note row for each unavailable figure; audited as `export`; rate class `export` |
| REP-10 | I keep a copy and open it later | Saved copies lists runs I may open; a copy shows the figures as they stood and its question; opening checks today's abilities (R6) |
| REP-11 | Copies do not pile up | `reports.expire-runs` deletes files past `reports.runs.keep-for`, set-wise, keeping the row as expired |
| REP-12 | I build and save my own report | Figures from those I may read, grouped by module; one breakdown every figure allows; scope kind and period rule; at most `reports.builder.max-columns`; inline validation |
| REP-13 | I share a saved report with my role, and archive it | Shared reports appear in that role's list; archiving says which schedules and pins it affects and pauses those schedules; Undo in the toast |
| REP-14 | A report runs itself every week | Weekly, monthly, season end, committee year end; a slot runs once under two concurrent ticks (S2); a missed slot runs once (S3); at most `reports.schedules.per-owner` |
| REP-15 | The people who need it get it by email | Email with up to six headline figures and a link; never the table or a file (S8); optional notification type, so a recipient can switch it off |
| REP-16 | A schedule never sends to someone who should not see it | Each recipient checked at send (S5); a schedule pauses when its owner loses the ability, including at the committee year end (S6), and after three failures (S7); a manager can take it over |
| REP-17 | A new committee member learns what each figure means | The Figures catalogue lists every figure I may read with help text, unit, combine, breakdowns and owner module; every figure has help text or the build fails |
| REP-18 | A producer sees their own show's numbers on the production | "Numbers" tab on a production and on a season, for a person with a grant there |
| REP-19 | Front of house's volunteers and incidents are reported | FoH contributes its figures; ready-made Volunteers and Incidents reports; meets FH-45 |
| REP-20 | The treasurer sees each show's money in one place | Finance and Payments contribute; ready-made Per-show finance; with Budgets and Companies on, their figures join the same report |
| REP-21 | The bar manager sees bar takings beside ticket sales | Bar contributes; `bar.report` is withdrawn from the Bar spec; Bar's own screen is unchanged |
| REP-22 | The secretary sees joiners, renewals and lapses by year | Membership contributes; ready-made Membership report; meets MEM-50 |
| REP-23 | The technical manager sees training held and lapsing | Training contributes; ready-made Training report by competency and route |
| REP-24 | We see how much each room is used | Core contributes `core.room-use` from the occupancy read (C-65); ready-made Room use report |
| REP-25 | The committee sees the season and the year at a glance | Ready-made Season at a glance and Committee year in numbers, contributed by Reports only (K3) |
| REP-26 | An incoming officer finds last year's numbers in their handover pack | Pins by `reports.report.manage`; the `governance.handover-section` contribution runs each pinned report for the post's committee year; Governance's snapshot keeps it |
| REP-27 | I print a report for a meeting | A4 print stylesheet with the question, the theatre's name and the date |
| REP-28 | Erasing or merging a person keeps schedules right | Erasure deletes recipient rows and pauses an emptied schedule; merge moves and de-duplicates; privacy record line present |
| REP-29 | Problems with schedules are visible | Health check warns on a schedule paused by failures or a run queued for over an hour |
| REP-30 | Every contributing module's figures appear as it is switched on | A module switched off hides its ready-made reports and shows its figures unavailable in saved ones; switching it on restores both with no migration |
| REP-33 | I split by two things at once | A pivot: a shared key across the top, each column repeated under each value, where every figure allows both keys; refused past reports.builder.max-columns cells across, naming the count (rule B2). Totals row and column both right for sum, distinct and level figures |
| REP-35 | We thank our most generous volunteers | A people report page: figures per named person from core.person-measure (first Front of house's minutes and shifts, FH-54, and Rehearsals' hours), with reports.people.view and each figure's ability, a banner saying opening is recorded, up to 6 figures, at most one shared breakdown, no formulas, pivots or filters, and no Schedule, Pin, Share or chart (rules P1 to P3, P8) |
| REP-42 | I work out one figure from others | Formula columns with + − × ÷, brackets, whole numbers and earlier columns only; units checked (money with money of one currency, money per item, count over count as a percent); totals row worked out from totals; division by nought is a dash; one parser on server and browser gives the same answer (rules B3 to B5, B7) |
| REP-43 | I narrow a report to some ticket types or venues | core.measure gains declared filters (R3-27): a figure lists the keys it honours; core refuses any other with core.measure.filter-not-declared before the module is asked; one key, 1 to 20 values; the builder offers only keys every figure declares; the filter is shown on the page, in print and on every copy (rules M11, B6). Each contributing spec adds its own filters as it is ready |
| REP-44 | A copy of a people report keeps no longer than it must | Keep a copy writes reports_person_rows (prefix rpe) with account ids, never names; rows deleted after reports.people.keep-for (90 days) and the run marked expired; staged erasure deletes a person's rows in every copy; a merge moves rows and marks the run stale with "Re-run to combine merged people"; the person's data download lists their rows (rules P5 to P7) |
| REP-45 | I download a people report | Needs reports.people.export; CSV made on the fly from the stored rows and today's names, headed "Contains personal data: do not forward", never stored; audited as export (rule P4) |

## Later

| Id | Story | Acceptance criteria |
| --- | --- | --- |
| REP-31 | I compare with last season | A second column per figure for the previous period or the same point last season, with the change |
| REP-32 | I see whether a show is selling faster or slower than others | Booking pace: tickets issued by days before opening, against chosen earlier productions; needs Box office's sale-date breakdown |
| REP-34 | I send a funder a link instead of a file | A signed, expiring link (T1 token) to one copy; counts of people below `reports.privacy.small-count` hidden; privileged ability. Matt chose a CSV now and links later (question 3) |
| REP-36 | A report is sent when a production closes | Cadence after a production's last performance |
| REP-37 | A PDF is made for me | Server-made PDF of a copy |
| REP-38 | Home figures share the same numbers | A `core.home-figure` may read a measure rather than its own query |
| REP-39 | I can practise reading reports | Reports in practice mode reads the practice store, marked, with schedules and exports refused |
| REP-40 | The rights holder's return is one click | Productions' licensing return contributed to `reports.report` and schedulable; lands with Productions' own stories |

## Order of work and what to cut

REP-01 to REP-04 and REP-41, then REP-05 to REP-10, then each module's figures as that module is ready (REP-19 to REP-24 in any order), then the builder (REP-33, REP-42, REP-43), then schedules (REP-14 to REP-16), then people reports (REP-35, REP-44, REP-45) once FH-54 lands. If time is short, cut from the end of the first release: REP-27, REP-25, REP-26 and REP-17 can slip without harm; REP-08, REP-16, REP-41 and REP-44 cannot, because they keep figures honest and private.

## As built

REP-01 is built in core: the point `core.measure`, `defineMeasure` in the kit, `readMeasure` and
`listMeasures` in core's services and the advanced setting `core.measures.read-budget` (10 seconds,
2 to 60). A figure's id is its contribution id, `<module>.<figure>`. The fixture module `seats`
carries four test figures (sold, capacity, fill as a ratio, takings as money); see
`tests/integration/measures.test.ts`.

REP-41 is built in core: the point `core.person-measure`, `definePersonMeasure` in the kit and
`readPersonMeasure` in core's services (`layers/core/server/measures/people.ts`). A figure per person
counts or totals minutes, breaks down by at most one shared key (never a module's own), and says
`side: 'members'`. The registry refuses one not named `<module>.<figure>`, whose ability is not
privileged with `audit: 'read'`, or whose `purpose` is not a `core.privacy-record` entry. The read
refuses with `core.person-measure.reports-only` unless it runs inside the `reports` module (a route
under `/api/reports/`), the ability `reports.people.view` is declared, and the reader is a person; it
then needs both `reports.people.view` and the figure's own ability, on the scope's record when there is
one. Rows must be an `acc_` id, the asked key and a number of nought or more; a key value that is an
account id or holds `@` makes the answer unavailable. Each read writes one audit row (action `read`,
the figure's ability) whose detail is the figure, the period, the scope as kind and id, the breakdown,
the outcome and the row count: no names, ids of people or figures. The test fixture `rota` contributes
`rota.minutes`; see `tests/integration/person-measures.test.ts`.

REP-02 is built in Box office: twelve figures in `layers/box-office/server/contributions/core.measure/`,
ability `box-office.report.view`. `tickets-issued` counts valid tickets; `tickets-sold` those not on a
complimentary ticket type and `tickets-comp` those on one; `admitted` those scanned in; `orders` and
`bookers` count confirmed orders and their accounts once each (combine distinct). These break down
and filter by `box-office.ticket-type` and `box-office.channel` as well as the performance keys.
`capacity` adds every band's pool, and `capacity-filled` is the ratio of issued over capacity.
`gross`, `refunds`, `net` and `net-of-vat` read Box office's own accounts in the ledger through
Finance's new service `performanceTotals` (sealed postings only): gross is sale postings, refunds
refund postings, net every kind (so recognition and fee transfers between Box office's accounts net
to nothing) and net of VAT that less the tax within it. Every figure keys to its performance's
operating day (M8). Core's `measuredPerformances(query, keys)` gives the performances in the period
and scope as a subquery with each shared key (performance, production, season, venue, space, day,
month), so no module hands round a list of ids (M9); a collection scope answers unsupported until
collections reach this branch. Deviations: `capacity` combines by sum, not level, because a run's
seats add up across its performances; `orders` and `bookers` are in, as the interface tab lists them.
`layers/box-office/tests/integration/figures.test.ts` proves the money matches `productionStatement`
to the penny.

REP-04 is built as the `reports` module (`layers/reports/`), with abilities `reports.report.view` and
`reports.people.view` (privileged, audit `read`, implies the first) and the data point
`reports.report`. A ready-made report names its area, scope kind (none, season, production or venue),
period rule, breakdown, one to twelve figures, an optional chart and the ability that lists it; it
lists only while its module is on and the reader holds that ability (K1), and one that names a figure
nobody declares, or whose ability does not cover its figures, is left out and logged (K3). The period
rules are `scope` (a production's first to last show night, a season's dates), `last-week` (from
`core.organisation.week-start`), `last-month`, `committee-year` and `last-committee-year` (from
`core.organisation.year-end`) and `chosen`, all in operating days. `GET /api/reports/figures` reads one
figure through `readMeasure`, names performances, productions, seasons and venues through
`core.record-resolver` and gives each performance its start; a figure the reader may not see answers
`hidden` and the page counts it rather than showing nought (M3). The page reads every figure by the
breakdown and again as a total, in parallel, and writes nothing. Box office contributes Sales and
attendance (scope production, breakdown performance, seven figures, a bar chart). The page offers the
breakdowns its figures share among performance, production, season, venue, day and month; module keys
such as channel wait for the builder. See `layers/reports/tests/integration/ready-made.test.ts`.

REP-09 to REP-11 are built in Reports. "Keep a copy" and "Download CSV" on a report page post to
`POST /api/reports/runs`, which works out the question (figures the reader may see, breakdown,
scope and dates) and stores it on a `reports_runs` row with the job `reports.run-report` on the bulk
lane. The job claims the run with `WHERE state = 'queued'` and `expect(1)` (R3), reads every figure
as the person who asked, lays the table out with the same function the page uses
(`layers/reports/shared/table.ts`, B7) and stores the CSV and the page's JSON with `storeFile` in
the slots `reports.run-csv` and `reports.run-data`, expiring after `reports.runs.keep-for`; past
`reports.runs.row-limit` rows it fails with `reports.run.too-large`. The CSV starts with the
report's name, the question in words and a "Not available" row for each figure that could not
answer, then the table and a totals row; money is in major units with a column per currency. Saved
copies (`/console/reports/runs`) lists the copies a person may open today, and a copy's page shows
its figures as they stood and checks again every few seconds while it is being made. Opening a copy
or its files needs `reports.run.view` on it (its requester holds that as owner) and, today, every
figure's own ability on its scope (R6); downloading needs `reports.run.export` and is audited as
`export`. The daily task `reports.expire-runs` marks copies past `reports.runs.keep-for` expired
in one statement and clears their file ids; core's files sweep removes the files themselves. The
server words a copy through the kit's new `siteWords()`, which reads every module's catalogue.
Deviations: a run keeps no `job_id`, and its file columns are plain ids rather than references,
because the files sweep deletes expired files. `reports_definitions` is created now for the
builder. See `layers/reports/tests/integration/copies.test.ts`.


REP-12, REP-13, REP-33, REP-42 and REP-43 are built in Reports. `/console/reports/new` (or "Save a copy
to change" on a ready-made report, which starts from its figures, K2) and `/console/reports/<id>/edit`
build a report from figures in the catalogue and formula columns, in an order set by dragging or the
row menu; moving a column renumbers the formulas that name it. A report has one key down the side, an
optional key across the top (a shared key every figure allows), one filter on a key every figure
declares, a scope kind with an optional usual record, a period rule, a chart and an optional role to
share with. `POST` and `PUT /api/reports/definitions` check every rule at once (B1 to B6, D1) and
refuse `reports.definition.invalid` with each fault under its field (`columns.<i>`, `rowsBy`,
`acrossBy`, `filter`); a name already used by an active report refuses `reports.definition.name-taken`.
Formulas are parsed and their units checked by `layers/reports/shared/formula.ts` on save, and worked
out by the same module in `layOut` in the browser and in a copy: count over count is a percent,
money over count stays money, and division by nought or two currencies is a dash. A saved report is
seen by its maker, by holders of the role it is shared with and by holders of `reports.report.manage`
(D4); its maker may change or archive it while they hold `reports.report.create`, and archiving
offers Undo. A figure a saved report names that is no longer offered keeps its place (so C-numbers
hold) and is counted under the table. A pivot whose copy would be wider than
`reports.builder.max-columns` is refused with `reports.run.too-wide`. Module keys (Box office's
ticket type and where it was sold) are named and listed through a new point, `reports.key`, which a
module contributes to for each key it breaks down or filters by. Deviations: the filter on a shared
record key (venue, production) takes one record; archiving says nothing of schedules or pins, which
do not exist yet; the builder has no live preview, as the saved report opens straight after saving.
See `layers/reports/tests/integration/builder.test.ts` and `layers/reports/tests/unit/formula.test.ts`.
