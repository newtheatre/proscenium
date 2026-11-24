# Sources

## Repository (newtheatre/proscenium, branch `next`, merge 654)

| Source | Used for |
| --- | --- |
| `docs/specs/foundations/02-formats.md`, `02-1` to `02-4` | Naming, manifest, settings, abilities and data-class formats |
| `docs/specs/foundations/06-interface-to-other-modules.md` | Index of id prefixes; names declared by second-round modules |
| `docs/kit/README.md` | The kit as built |
| `docs/specs/box-office-payments-ledger/` (parts 2, 3, 4, 7, 8) | The donation line kind left for later; ledger posting rules; Direct Debit belongs with Membership and Fundraising |
| `docs/specs/front-of-house/` | Tone, depth and layout of a second-round specification |
| `docs/specs/membership/` | Supporters' schemes and the `membership.supporter` fact |
| `docs/specs/communications/02-scope-and-glossary.md`, `05-interface-to-other-modules.md` | Appeals sent through Communications; audience sources |
| `docs/design-paper/04-2-module-catalogue.md`, `04-4-beyond-proscenium.md`, `07-roadmap.md`, `09-3-payment-providers.md` | Fundraising's catalogue entry and phase 6 placement |
| `layers/payments/server/points/settlement.ts`, `desk-basket.ts`, `intents.ts`, `attest.ts`, `payouts.ts` | Several owners per payment; the till panel contract; why money from the bank needs a new service |
| `layers/finance/module.ts`, `server/ledger.ts` | `finance.system-account`, scoped accounts, the own-accounts trigger |
| `layers/membership-fees/module.ts`, `server/paying.ts` | The model for a module that owns its own payment parts |
| `layers/box-office/module.ts`, `server/checkout.ts`, `server/db/schema.ts` | The online basket's single part today; the order line kinds |

## Planning documents

- Proscenium: the plan beyond what is built, Overview tab, "The third round of specifications"
- The third-round brief, `third-round-specs/brief.md` in the project files
- The Reports thread's `core.measure` contract, `third-round-specs/reports-measure-contract.md` in the project files
- Boundaries agreed on 23 November 2026 with the Companies, Invoices and exports, Reports and Festival-ready changes threads

## HMRC guidance (read 23 November 2026)

- [Charities: detailed guidance notes, chapter 3: Gift Aid](https://www.gov.uk/government/publications/charities-detailed-guidance-notes/chapter-3-gift-aid), updated 20 October 2026: declaration contents (3.6, 3.9), oral declarations (3.10), cancellation (3.8), donor benefit limits (3.21, 3.22), membership subscriptions (3.37), records and retention (3.27 to 3.30)
- [Gift Aid declarations: claiming tax back on donations](https://www.gov.uk/guidance/gift-aid-declarations-claiming-tax-back-on-donations): what a declaration must include
- [Gift Aid: what donations charities and CASCs can claim on](https://www.gov.uk/guidance/gift-aid-what-donations-charities-and-cascs-can-claim-on): tickets and suggested donations at events
- [Schedule spreadsheet to claim back tax on Gift Aid donations](https://www.gov.uk/guidance/schedule-spreadsheet-to-claim-back-tax-on-gift-aid-donations): columns, aggregation of £20 and under to £1,000, 1,000 lines
- [Claim Gift Aid: how to claim](https://www.gov.uk/claim-gift-aid/how-to-claim): the four-year claim deadline; software for larger claims
- [Claim Gift Aid: Small Donations Scheme](https://www.gov.uk/claim-gift-aid/small-donations-scheme): £30 per gift, £2,000 a year, eligibility

- HMRC, [Claiming a top-up payment on small charitable donations](https://www.gov.uk/guidance/claiming-a-top-up-payment-on-small-charitable-donations): donations of £30 or less in cash or by contactless; top-up on up to £8,000 a tax year, no more than ten times the Gift Aid donations claimed that year; Gift Aid claimed in the same tax year; no penalty in the last two tax years; claims within two years of the end of the tax year; more for community buildings. Read 24 November 2026 for SD1 to SD7.

HMRC's printed model declaration forms were not read; the declaration wording is the theatre's own content page and must meet the contents list above.
