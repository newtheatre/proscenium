# Reports: module specification

Nov 23, 2026 · @Matthew Adcock

This is the third-round specification for Reports, spec 12 of 15, written on 23 November 2026. It is a module plus a kit point: every module declares its own figures once through `core.measure`, and Reports lays them side by side, keeps copies, schedules them and lets people download them. On 24 November 2026 Matt answered the questions in tab 9: figures per person, such as volunteer hours, and a full builder with pivots, formulas and filters are both in the first release, and the other answers went as recommended. Nothing has been built or run.

## The design in six sentences

1. A module says what each of its figures means, once, and core answers any module that asks for it.
2. A figure is a total over people, never a person, so a report can travel without carrying anyone's data; the few figures per person, such as volunteer hours, go through their own fenced point, are audited on every read, never leave the console except as a download, and are erased with the person.
3. Reports owns no figure: it chooses figures and formulas, a breakdown, a pivot, a filter, a scope and a period, and asks.
4. Every figure is still guarded by its own module's ability, so Reports never shows a number a person could not see in that module.
5. A missing figure is told as missing, never as nought, and totals follow how each figure combines.
6. A copy freezes the figures with a CSV; a schedule makes copies and emails headline totals with a link, re-checking each recipient every time.

_[Diagram: at a glance · who gives figures and who reads them]_

Only totals cross the middle box. Productions and Festival read figures through core directly, so they work with Reports switched off; Governance's handover pack gets them through the reports pinned to each post.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope and glossary | In and out, assumptions, ten ready-made reports, 12 words Reports owns |  |
| 2. Data model | The `core.measure` and `core.person-measure` contracts, then six tables in the Foundations layout | 6 tables, 5 id prefixes |
| 3. States and rules | Life cycles of a run, a schedule and a saved report; every rule with an id, including the builder (B) and people reports (P) | 3 life cycles, 51 rules |
| 4. Interface to other modules | Manifest, what core gains, the figures 19 modules contribute, figures per person, points, routes, changes to other specs | 1 point declared, 13 contributed to; reads 2 core points |
| 5. Screens | Inventory and a wireframe of the report page | 8 console screens, a modal, a record tab, a settings page |
| 6. Settings and abilities | Settings, abilities, record types, presets | 7 settings (plus 1 core), 9 abilities, 3 record types |
| 7. Stories | REP-01 to REP-45 with an order of work and a cut order | 5 gate, 32 first, 8 later |
| 8. Test plan | Proof P-REP-1 on D1, then named cases | 1 proof, 19 unit, 31 integration, 8 end-to-end |
| 9. Questions for Matt | Seven questions with recommendations and Matt's answers | All 7 settled |

## Combined and split

Matt asked for a look at where modules should be combined or split further. For Reports:

- **Absorbed into Reports:** the later point `bar.report` (withdrawn), Front of house's incident trends (FH-45) and Membership's joiners and renewals by year (MEM-50). Each becomes figures plus a ready-made report, not a screen of its own.
- **Kept out, on purpose:** accounting exports and the parent body's format (Invoices and exports), royalty calculation (Productions), election results (Elections), each module's own working screens (Bar's reports, Finance's statement, the night report) and the home and Tonight figures. Reports reads the same figures; it never takes over a module's own screen.
- **Not split further.** Schedules and copies are small and only exist for reports; a separate "exports" module would have nothing of its own once accounting exports went to Invoices and exports.

## Catalogue lines and where they went

| Catalogue line | In this specification |
| --- | --- |
| Sales, attendance and occupancy by performance, production and season | First release: Sales and attendance, Season at a glance; "occupancy" is now capacity filled |
| Volunteer and training reports | First release: Volunteers, Training, and volunteer hours by person as a people report (REP-35) |
| Financial summaries per show | First release: Per-show finance |
| Returns for licensing bodies and rights holders | Productions' licensing return, drawn by Reports (REP-40); Bar's licensing sheet stays Bar's |
| Every report exportable, and schedulable by email | First release: CSV download, print, schedules |

## Open before it can be called settled

- **Matt's questions are all answered** (tab 9, 24 November 2026), and the two changes they brought, `core.person-measure` and declared filters on `core.measure`, were agreed with Integration as ruling R3-27.
- **Every third-round thread's figures are agreed** (Integration rulings, 23 November 2026), and question 7's recommendation was adopted as ruling R3-21: the gate is built in stage 3. Box office, Payments, Finance, Front of house, Bar and Membership are built, so their figures go through Integration; Box office's are one amendment story, BO-76. Each contributing spec now also lists the filter keys its figures honour.
- **Figures per person need their contributors:** Front of house's minutes and shifts worked are FH-54; Rehearsals numbers its own person-hours story. Their ability and purpose names in tab 4 are proposals for those specs to confirm.
- **Core's side** (`core.measure` with filters, `readMeasure`, `listMeasures`, `core.person-measure`, `readPersonMeasure`, the read budget, `core.room-use`) must be written into the core amendments and the Foundations index, and `reports_person_rows` into staged erasure.
- **Proof P-REP-1 has not been run.**
