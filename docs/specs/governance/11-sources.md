# Sources

Read on 23 November 2026. Repository paths are on branch `next` of newtheatre/proscenium (merge of PR 654) unless marked as the old system (newtheatre/proscenium-old).

| Source | Used for |
| --- | --- |
| Third-round brief, `/mnt/project-files/third-round-specs/brief.md` | Format, rules, Governance's scope |
| Proscenium: the plan beyond what is built, Overview | One document register; Elections split out; the spec table |
| `docs/design-paper/04-2-module-catalogue.md`, Governance | The catalogue's six items, including honours and feedback |
| `docs/specs/foundations/02-3-abilities-registry.md`, `02-4-data-class-registry.md` | Ability fields, facts, table options, data classes, erasure |
| `docs/specs/front-of-house/` | Layout and depth of a second-round spec |
| `docs/specs/identity/03-data-model.md`, `07-settings-and-abilities.md` | Pinned fact mappings, preset roles, year-end expiry |
| `docs/consistency-review/integration-rulings.md` | R-03 (fifteen preset roles) |
| `layers/core/server/db/identity.ts` | `core_roles`, `core_grants`, `core_grant_ends`, `core_fact_abilities` as built |
| `layers/core/server/identity/year-end.ts`, `grants.ts` | `core.organisation.year-end` as built; pinned mappings not yet resolved |
| `layers/core/server/db/domain.ts` | `core_files`, `core_policy_versions` |
| `layers/core/module/points.ts`, `server/points/record-check.ts`, `server/contributions/core.requirement/roles.ts` | Core points and the requirement and record-check contracts |
| `layers/*/module.ts` | Facts other modules declare (membership `holder`, `voter`; front of house `on-shift`) |
| `/mnt/project-files/third-round-specs/reports-measure-contract.md` | `core.measure` |
| Old system: `docs/decisions/0086` | Feedback as a queue row, triaged outside the Worker |
| Old system: `docs/decisions/0107`, `content/committee.yml`, `shared/utils/committee.ts` | The committee as quoted data, the out-of-date notice after the August grace |
| Old system: `docs/decisions/0113`, `0115` | Posts holding one role each; "a live committee role" as a requirement |
| Old system: `server/db/schema/feedback.ts` | The feedback table as NNT runs it |
| Old system: `content/docs/09.people/4.roles.md` | How NNT's committee year and handover work today |
| Project memory: site policies | Policies as repo Markdown; review marks tied to a version left unbuilt |
| Threads this round: Elections, Productions, Reports, Inventory | The agreed boundaries in the Overview |
