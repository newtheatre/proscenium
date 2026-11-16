# Sources and prior art

Every claim this specification makes about another system comes from the pages below, all read on 16 November 2026. Nothing was copied from any of them; the design is new.

## The reference project

Matt's [form-builder](https://github.com/MattA-Official/form-builder) was read through its public pages: the README, [`server/db/schema.ts`](https://github.com/MattA-Official/form-builder/blob/main/server/db/schema.ts), [`shared/types/rule.ts`](https://github.com/MattA-Official/form-builder/blob/main/shared/types/rule.ts), [`shared/types/formItem.ts`](https://github.com/MattA-Official/form-builder/blob/main/shared/types/formItem.ts) and the file lists of `shared/utils` and `app/components/builder`. The components and the rule engine's code were not read line by line.

| What it does | Taken as inspiration | Done differently here, and why |
| --- | --- | --- |
| One ordered list of questions, sections and text blocks, with drag and drop and autosave | The single ordered list and saving without a button | Edits go to a draft, never the live form, so a half-finished change cannot reach respondents |
| Validation rules with custom messages, "enforced identically on the client and the server" (README) | One definition checked in both places | The agreement is proved by a shared case set run in both runtimes |
| Repeating groups, and two questions side by side | Both | A calculation can sum or count across a group |
| Rules held in their own table: a condition group (`all` or `any`) and an action (`show`, `hide`, `skip_to`, `terminate`, `submit_now`) | The five things a rule can do, and operators offered by question type | Logic sits on the item it affects and is read as a sentence. A separate list of rules is the "rule table" the paper rules out, and it lets two rules contradict each other about one question |
| Condition values are text, and groups do not nest |  | Typed comparisons, and nesting to a limited depth |
| Items are rows edited in place; a response is one JSON object keyed by item id |  | Immutable versions, and a field catalogue, so an old response still knows what it answered |
| No accounts, permissions, drafts, windows or stages |  | All specified here, because the platform has people and records to connect to |

## Other form systems

| System | What was read | What it showed |
| --- | --- | --- |
| [XLSForm](https://xlsform.org/en/) | The standard's reference page | Four ideas attached to each question have served field data collection for years: `relevant` (when to show), `constraint` with `constraint_message`, `required`, and `calculation`. This specification's visible-when, checks, required-when and calculations are the same four. XLSForm writes them as formula text; here they are structured so they can be built from pickers |
| [SurveyJS](https://surveyjs.io/form-library/documentation/design-survey/conditional-logic) | Its conditional-logic documentation | A whole form stored as one JSON object, with `visibleIf`, `enableIf` and `requiredIf` on elements, `calculatedValues`, and `triggers` to complete or skip. Confirms the one-document definition. Its expressions are strings evaluated at run time; this design stores a tree, so a condition can be checked at publish and shown as a sentence |
| [JSON Forms](https://jsonforms.io/docs/) | Its introduction | It keeps a data schema apart from a UI schema. Not followed: a theatre's author thinks of one form, and two schemas are two things to keep in step. The field catalogue gives the same stable view of the data |

## Proscenium

Read for what a proposals process needs, not as a base.

| Source | Used for |
| --- | --- |
| [`docs/backlog/B-productions.md`](https://github.com/newtheatre/proscenium/blob/main/docs/backlog/B-productions.md), stories B-301 to B-303 | The requirements of a proposals round: windows per season, private drafts, immutable after the deadline, private scores, declared conflicts with lockout, a recorded decision with feedback, and acceptance creating the production. Each is mapped in tab 1 |
| `docs/data-model.md`, the incident and checklist tables | An example of fixed-layout records (incident severity, checklist items) that a theatre cannot reshape, which is the gap a form builder fills |

Proscenium has no form builder or custom fields; a search of its documentation for either found nothing.

## The platform's own documents

| Document | Used for |
| --- | --- |
| [Design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD): Form builder, Decisions, Module catalogue, Accounts, Part B and its sub-tabs, Roadmap, Next stage | The requirements, the conventions and the nine-part format |
| [Foundations specification](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x): Module manifest and Settings registry sub-tabs, and its rulings sent on 16 November 2026 | Points and contributions, units of work, per-row data classes, naming, the settings table format, `switchable: false`, public components, erasable columns in append-only tables |
| Interface specification (workstream 6), by message on 16 November 2026 | Page types, the form rules for rendered forms, the points for navigation, record tabs and home cards |

## Cloudflare

| Page | Used for |
| --- | --- |
| [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Row size 2 MB, 100 bound parameters per query, 100 columns per table, 30 seconds per query or batch, on the Workers Paid plan |

## Not yet checked

- No theatre other than NNT has been asked what forms it needs. The template list is drawn from the paper.
- Mailflare and Flytower were not read for this workstream: neither has a form builder, and their conventions reach this document through the paper and the foundations specification.
- The interface and core domain specifications were not read in full. Their rulings reached this document by message on 16 November 2026, and tab 5 should be checked against the interface specification's page conventions at integration.
