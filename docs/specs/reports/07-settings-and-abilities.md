# 6. Settings and abilities

Reports has six settings, seven abilities and three record types. The abilities are deliberately thin: seeing Reports is one ability, and every figure is still guarded by its own module's ability, so Reports can never show a number a person could not see in the module itself.

## Settings

Groups: `runs` and `schedules` on Reports' page in Admin under Modules (set once, rarely changed); `builder` and `privacy` in Admin's advanced page. Every operational number ships as its proposed value below.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reports.runs.keep-for` | duration | 2 years | 30 days to 7 years | `reports.settings.manage`, with confirmation | staff | No | How long a copy and its files are kept. Two years so a new committee can see the last committee's copies; Matt confirmed this on 24 November 2026 (question 6). People reports have their own, shorter setting |
| `reports.runs.row-limit` | integer (rows) | 20,000 | 1,000 to 100,000 | `reports.settings.manage` | staff | No | Largest run; a bigger one fails with advice to narrow it |
| `reports.schedules.send-at` | local time | 07:00 | 00:00 to 23:45, quarter hours | `reports.settings.manage` | staff | No | The time a new schedule starts with |
| `reports.schedules.per-owner` | integer | 10 | 1 to 50 | `reports.settings.manage` | staff | No | Most active schedules one person may own |
| `reports.builder.max-columns` | integer | 60 | 1 to 200 | `reports.settings.manage` | staff | No | Most columns in one saved report, counting each pivoted repeat and each formula, which bounds a page's reads and the width of a copy (rules B1 and B2) |
| `reports.people.keep-for` | duration | 90 days | 1 day to 1 year | `reports.settings.manage`, with confirmation | staff | Yes, on the privacy page | How long a copy of a people report keeps its rows (rule P5). Short because the rows name people; long enough to cover an awards round or a term's thank-yous |
| `reports.privacy.small-count` | integer | 5 | 2 to 20 | `reports.settings.manage`, with confirmation | staff | No | Below this, a count of people is hidden in anything that leaves the console (later story REP-34); unused before that |

Core gains one setting with this spec: `core.measures.read-budget`, duration, 10 seconds, 2 to 60 seconds, advanced group, `core.settings.manage`: how long one figure's read may take before it is unavailable.

No preset changes a default.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `reports.report.view` | `core.production`, `core.season` | normal |  |  | Open Reports, ready-made reports and reports shared with one's role; read the catalogue. Each figure still needs its own ability. A grant on a production or season reads that record's reports | `committee-member`, `box-office-manager`, `front-of-house-manager`, `bar-manager`, `technical-manager`, `finance-officer`, `membership-officer`, `communications-officer`; `production-lead` and `visiting-company` by grant on their production |
| `reports.report.create` |  | normal |  | `report.view` | Save one's own reports and edit them | `committee-member` and every manager role above |
| `reports.report.manage` | `reports.definition` | normal |  | `report.create`, `run.view` | Edit, share, archive any saved report; pin reports to posts | `administrator`, `finance-officer`, `membership-officer` (the secretary keeps the handover packs) |
| `reports.run.view` | `reports.run` | normal | grants |  | Open and download copies; the person who asked for a copy always may, if they still hold the figures' abilities | Everyone with `reports.report.view` |
| `reports.run.export` |  | normal |  | `run.view` | Download a CSV. Audited as `export` | Everyone with `reports.report.view` |
| `reports.schedule.manage` | `reports.schedule` | normal | grants |  | Schedule a report to other people; pause, resume, take over, end any schedule. Scheduling to oneself needs only view | `administrator`, `committee-member`, `finance-officer`, `box-office-manager` |
| `reports.people.view` | `reports.definition` of kind people | privileged, audit read |  | `report.view` | Make, open and keep copies of people reports (figures per named person). Each figure still needs its own privileged ability. Every read is audited (rules P1 and P2) | None by preset; granted on purpose (for NNT, the front-of-house manager for volunteer hours) |
| `reports.people.export` | `reports.run` of kind people | privileged |  | `people.view` | Download a people report as CSV, made on the fly and never stored. Audited as `export` (rule P4) | None by preset |
| `reports.settings.manage` |  | privileged |  |  | Change Reports' settings | `administrator` |

None is impliable by another module. Downloading is normal risk, not privileged, because a run holds aggregates only (rule M2); if question 2 brings per-person totals, that later story adds its own privileged, read-audited ability rather than raising this one.

## Facts

Reports declares no fact. Authority to see a figure comes from the figure's own ability, which may itself be met by a fact (a duty manager on tonight's shift reading tonight's sales through `front-of-house.on-shift`).

## Record types

| Record type | Parent | Owner column | Note |
| --- | --- | --- | --- |
| `reports.definition` | none | `made_by` | A saved report |
| `reports.run` | none | `requested_by` | A copy; files are reached through it |
| `reports.schedule` | none | `owner_id` |  |

## Role presets

Added through the manifest's `presets` role mappings (there is no role preset point, Integration ruling R3-11) to the student-society, amateur company and small venue presets alike, as in the Suggested holders column. The `committee-member` preset is read-only across modules, so it gains view, create and schedule but not manage.
