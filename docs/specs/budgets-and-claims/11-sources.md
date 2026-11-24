# Sources

Everything below was read on 23 November 2026. Repository paths are on branch `next` of newtheatre/proscenium at commit cf7907e1 unless marked old.

## Built code

| Source | Used for |
|---|---|
| `layers/finance/server/db/schema.ts` | Ledger tables, posting kinds CHECK, entry dimensions (`production_id`, `performance_id`, `for_module`) |
| `layers/finance/module.ts`, `server/services.ts`, `server/ledger.ts` | `finance.system-account`, `finance.period-close-check`, `postEntries`, `reversePosting`, `balances`, abilities |
| `layers/finance/server/api/finance/accounts.post.ts` | Accounts a treasurer gives to a module |
| `layers/payments/module.ts`, `server/services.ts`, `server/payouts.ts`, `server/owner-payments.ts` | System accounts (`payments.bank`, `cash`), `payments.settlement`, the hand-entered payout pattern |
| `layers/core/module/points.ts`, `identity.ts` | `core.record-tab`, `core.record-fact`, `core.home-card`, `core.erasure-hold`, `core.supplier` and the other points contributed to |
| `layers/core/server/db` (table list) | No departments table; seasons, productions, terms, files exist |

## Specifications and papers

| Source | Used for |
|---|---|
| `docs/specs/foundations` (data classes, abilities, settings, id prefix index in part 4) | Formats, erasure behaviours, prefix check |
| `docs/specs/front-of-house` | Model of tone and depth for a second-round spec |
| `docs/specs/box-office-payments-ledger/02-scope.md` | "The rest of Finance" left for later |
| `docs/specs/identity/07-settings-and-abilities.md` | Preset roles |
| `docs/specs/core-domain-and-public-site/03-data-model.md` | `core_files`, slots, vocabularies |
| `docs/specs/form-builder/05-interface-to-other-modules.md` | An earlier proposal for a `finance.expense-claim` form outcome, not taken up: claims have their own flow |
| `docs/design-paper/04-2-module-catalogue.md`, `07-roadmap.md` | Finance catalogue entry; phase 6 |
| `docs/consistency-review/integration-rulings.md` | R-27, the rest of Finance in phase 6 |
| Old: newtheatre/proscenium-old `docs/backlog/I-finance.md` | I-201 (production budgets, never block), I-202 (claims append-only, racing approvals), I-203 (settlement) |
| Proscenium: the plan beyond what is built, Overview | Third-round boundaries: Finance's rest split in two |
| `/mnt/project-files/third-round-specs/brief.md` | Format and rules |
| `/mnt/project-files/third-round-specs/reports-measure-contract.md` | `core.measure` contract |

## Agreements with other threads, 23 November 2026

| Thread | Agreed |
|---|---|
| Invoices and exports (spec 9) | Boundary; ledger tag for spend; `invoicing.cost-coding` point; Payments outgoing payments and payee store written in its tab 4; posting kinds; Budgets owns the parent-body claims schedule |
| Companies (spec 3) | Awards are Budgets'; `companies.settlement-note`; fact `companies.contact-of`; no bank details in Companies |
| Productions (spec 4) | Productions stores no budget; `productions.licence.fee-due`; category slug `rights`; record fact and tab |
| Reports (spec 12) | `core.measure` figures |
| Inventory (spec 11) | "Kit departments" kept apart; one theatre-wide department list for Integration to rule |

## Matt's rulings cited

- Owners exempt from "not your own record", but not from four-eyes rules (23 November 2026, PR 643).
- No cash by default; card machines and cash are payment-method accounts (PRs 557 and 558).
- Settings on subject pages via the cog; fixed choices as dropdowns; drag and drop with `@dnd-kit/vue`; settings rules check pending changes together (PR 562).
- Production database: read, never write; live deploys need his say (relevant to question 11).
