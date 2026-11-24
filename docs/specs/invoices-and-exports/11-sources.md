# Sources

Read on 23 November 2026. Repository paths are on branch `next` of newtheatre/proscenium at commit cf7907e1, unless marked old Proscenium (newtheatre/proscenium-old).

## Plans and briefs

| Source | Used for |
| --- | --- |
| Proscenium: the plan beyond what is built, Overview (third round) and Other unbuilt plans | The split of Finance's rest into Budgets and claims, and Invoices and exports |
| Third-round brief, `/mnt/project-files/third-round-specs/brief.md` | Format, rules, the sixteen specs |
| Reports' measure contract, `/mnt/project-files/third-round-specs/reports-measure-contract.md` | The three figures in part 4 |
| Reports specification, 2. Data model | `reports_schedules`' cadence shape |
| `docs/design-paper/04-2-module-catalogue.md`, Finance and Payments | "Invoices in and out", "exports to an accounting package or a parent body's format"; invoice is not a payment method |
| `docs/design-paper/07-roadmap.md`; `docs/consistency-review/integration-rulings.md` R-27 | The rest of Finance placed in phase 6 |
| `docs/specs/box-office-payments-ledger/02-scope.md`, `08-stories.md` (FIN-01 to FIN-07) | What Finance's first release covers, and FIN-07 (tax) as later |
| `docs/specs/spaces-and-room-booking/10-questions-for-matt.md`, question 6 | Paid hire deferred to a module of its own |
| `docs/specs/foundations/02-3-abilities-registry.md`, `02-4-data-class-registry.md`, `06-interface-to-other-modules.md` (index of id prefixes, link tokens), `02-1-module-manifest.md` (reserved prefixes) | Formats used throughout |

## Built code read

| Path | Used for |
| --- | --- |
| `layers/finance/module.ts` | Settings (`finance.tax.registered`, rule tax-not-yet), abilities, `finance.system-account`, `finance.period-close-check` |
| `layers/finance/server/db/schema.ts` | Accounts, postings, entries, seals, periods, tax codes; posting kinds |
| `layers/finance/server/ledger.ts`, `reports.ts`, `api/finance/export.get.ts`, `api/finance/accounts.post.ts` | How postings are written; today's CSV export, its 50,000-line ceiling and formula guard; accounts given to a module |
| `migrations/20261119014050_baseline/migration.sql`, trigger `finance_entries_account_module` | Only Payments may write entries for another module (amendment F-A1) |
| `layers/payments/module.ts`, `server/points/settlement.ts`, `server/providers.ts`, provider `other` | Owner settlement, the `bank` and `other` accounts, `other_attested` on the desk channel (amendment P-A2) |
| `layers/*/server/db` | Every declared id prefix, to check this spec's ten |

## Old Proscenium

| Path | Used for |
| --- | --- |
| `content/docs/10.money/6.exports.md` | The students' union export as NNT's treasurer used it |
| `shared/utils/su-export.ts` | Its columns, unmapped line, card-total line, row cap |
| `docs/backlog/I-finance.md`, stories I-108 and I-301, open question 4 | The union return's acceptance criteria; hire invoicing "never initiated by the system" |
| `docs/decisions/0130-the-su-export-traces-each-line-in-columns-after-the-six-it-always-had.md` | The six fixed leading columns |

## Accounting packages' import help (found by web search on 23 November 2026; summaries read, pages not opened)

| Package | Page |
| --- | --- |
| QuickBooks Online | [Import journal entries](https://quickbooks.intuit.com/learn-support/en-uk/help-articles/import-journal-entries-in-quickbooks-online/01/507742) (UK) and [the US article](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data-files/import-journal-entries-quickbooks-online/L4tQBwbs7_US_en_US): columns Journal No., Journal Date, Account Name, Journal/Description, Debits, Credits |
| Xero | [SaasAnt: importing manual journals into Xero](https://support.saasant.com/support/solutions/articles/14000129223-how-to-import-manual-journals-into-xero/) and [ApprovalMax: troubleshooting manual journal CSV upload](https://support.approvalmax.com/en/articles/414430-troubleshooting-potential-errors-during-manual-journal-creation-via-csv-file-upload): blank narration and date continue a journal; Xero's own template is downloaded from its import screen; bank, receivable and payable accounts are refused in manual journals |
| Sage | [Sage Accounting: import journal entries](https://help.accounting.sage.com/en-ca/accounting/importing/import-journals.html) |

The Sage 50 and FreeAgent column lists in part 4 are from memory and approximate; IE-21 confirms every header against the vendor's own template before it is built.

## Agreed in threads this round

Companies (spec 3), Budgets and claims (spec 8), Fundraising (spec 10) and Reports (spec 12), 23 November 2026, as summarised on the Overview and at the end of part 4.

## VAT

Found by web search; summaries read, pages not opened. They back rules I-41 and I-45; rounding per line (rule I-42) is this spec's choice and was not confirmed against HMRC's rounding guidance, which should be checked before IE-31 is built.

- [VAT guide (VAT Notice 700)](https://www.gov.uk/guidance/vat-guide-notice-700): what a full VAT invoice must show, and when a simplified one is allowed.
- [VATREC5010, details which must be shown on a full VAT invoice](https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec5010).
- [Relief from VAT on bad debts (VAT Notice 700/18)](https://www.gov.uk/guidance/relief-from-vat-on-bad-debts-notice-70018): six months from the later of the due date and the time of supply, written off in the accounts.
- [Cash Accounting Scheme (VAT Notice 731)](https://www.gov.uk/guidance/vat-cash-accounting-scheme-notice-731).
- Built code: `layers/finance/server/db/schema.ts` on `next` (commit cf7907e1): `finance_tax_codes`, the entry columns `tax_code` and `tax_minor`, and the CHECK `finance_entries_tax`; `layers/finance/module.ts`: setting `tax.registered` and the rule `tax-not-yet`.
