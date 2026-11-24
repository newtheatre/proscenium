# Sources

What this spec was written against, read on 23 November 2026 from branch `next` of newtheatre/proscenium (commit 42eb7c86) and the project's shared files.

| Source | Used for |
| --- | --- |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview (third round) and Festivals tabs | The merge into Companies; the performer view (section 10), the call-to-timetable flow, FE-08 |
| `/mnt/project-files/third-round-specs/brief.md` | Format, rules, the fifteen specs and what each leans on |
| `layers/core/server/db/domain.ts` | `core_productions` (`kind`, `company_name`), seasons, credits, spaces, performances |
| `layers/core/server/db/identity.ts` | Append-only grants, record scope |
| `layers/core/module/points.ts`, `core/module/identity.ts` | Core points (`record-tab`, `record-fact`, `record-resolver`, `account-section`, `role-preset`, `erasure-handler`) |
| `layers/finance/server/db/schema.ts`, `ledger.ts`, `reports.ts`, `module.ts` | Accounts per module, posting kinds, idempotency, `productionStatement`, `finance.system-account` |
| `layers/box-office/server/db/schema.ts` | Staff holds with a label, complimentary requests and orders, pools |
| `docs/specs/foundations` (data-class registry, manifest) | Table and column format, id prefixes, classes and erasure, `col.perRow` |
| `docs/specs/front-of-house`, `docs/specs/spaces-and-room-booking` | Tone and depth; Spaces' external bookables, its question 6 and SP-43 on paid hire |
| `docs/specs/box-office-payments-ledger` parts 3, 6 and 7 | The `visiting-company` grant this spec replaces with a fact; the production statement screen |
| `docs/design-paper/04-2-module-catalogue.md` | "Allocations held for a visiting company, agent or promoter" |
| Project memory: platform plan map, theatre platform decisions, box office build notes | Rulings cited: owners exempt from own-record rule, no cash by default, payments through `payments.settlement` |

## Agreements reached with other threads

Recorded in part 4, "Agreed with other specs": Programme planning, Festival, Productions, Budgets and claims, Invoices and exports, Fundraising, Inventory and Reports, all on 23 November 2026.
