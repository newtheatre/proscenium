# Sources

Read on 23 November 2026, repository `newtheatre/proscenium` at branch `next` (commit cf7907e1).

| Source | Used for |
| --- | --- |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview ("The third round of specifications") and Festivals tabs | Boundaries, pieces 4 (call to timetable) and 5 (the board) |
| `/mnt/project-files/third-round-specs/brief.md` | Format, rules, scope, sibling threads |
| `docs/specs/foundations/02-formats.md` and `06-interface-to-other-modules.md` | Naming, the four mechanisms, rule M3, the id prefix index |
| `docs/specs/front-of-house/03-data-model.md`, `07-settings-and-abilities.md` | Table and ability layouts |
| `docs/specs/spaces-and-room-booking/01` to `05` | `core.space-busy`, yielding times, the calendar, rule K2 |
| `docs/specs/form-builder/03-data-model.md`, `05-interface-to-other-modules.md`, `08-stories.md`, `10-questions-for-matt.md` | Slots, bindables, outcome actions, FB-512 history, `forms.season-call` |
| `docs/design-paper/04-2-module-catalogue.md` | The Programming section this module absorbs |
| `docs/specs/identity/07-settings-and-abilities.md` | The fifteen preset role keys |
| `layers/core/server/db/domain.ts` | Seasons, productions, credits, spaces (`exclusive`, `managed`), closures, performances and their states |
| `layers/core/server/programme/performances.ts` | `noClash`, `assertSpaceFree`, `whyNotFree`; drafts are not guarded |
| `layers/core/module/domain.ts` | `core.programme.turnaround`, a site-wide duration, default 0 |
| `layers/forms/server/db` | Review rounds and assignments with private scores and conflicts |
| `newtheatre/proscenium-old`, `docs/backlog/B-productions.md` (B-301 to B-303) | Proposal windows, private review, "publishing a season pushes shows as coming soon", retention of unsuccessful proposals |
| Project memory: theatre-platform-decisions, platform-plan-map, wsaf-fit-assessment | Programming low priority; NNT plans on paper; WSAF's scale (120 to 165 events, about 10 venues, 4 days) |

## Agreed by message, 23 November 2026

| Spec | Thread | What |
| --- | --- | --- |
| Festival (2) | Festival | Board and publish are this module's for festival seasons; `plan.published`; `board-days` |
| Companies (3) | Companies | `company_id`; `entry.accepted`; `entry-contacts`; `entry-source`; one sender of slot notices |
| Productions (4) | Productions | `entry.accepted` carries `rightsStatus`; team as core credits |
| Rehearsals (5) | Rehearsals | Calls through Spaces; `core.person-busy`; reads occupancy |
| Reports (12) | Reports | "Occupancy" for the view; "room use" from core |
| Inventory (11) | Inventory | Occupancy is spaces only and never decides a write |
| Festival-ready changes (15) | Festival-ready changes | Core service names; C-65 this spec's; `schedulePerformances` |
