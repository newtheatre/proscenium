# 6. Settings and abilities

Twenty settings, twenty-five abilities, seven record types, one fact, one secret key name and five notification types. Every operational number in parts 3 and 5 is a setting here; none is a constant in code.

## How to read this part

Written in the Foundations registry formats, in the column layout the Box office specification uses. Settings are site-wide. Where a value varies by outlet it is a field on the outlet, and the table says so. All settings are changed by `bar.settings.manage`. Defaults are proposals for a small theatre.

## Settings

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `bar.age-check.enabled` | boolean | true |  | staff | No | Prompt on restricted products and keep the register |
| `bar.age-check.minimum-age` | integer (years) | 18 | 16 to 25 | public | Yes | The legal age, quoted on a public price list |
| `bar.age-check.challenge-age` | integer (years) | 25 | 18 to 30 | public | Yes | The age in the prompt: "look under 25". Must be at least the minimum age |
| `bar.age-check.description` | boolean | false |  | staff | No | Offer an optional short description of the person on a refusal. Off unless a licence condition asks for it |
| `bar.age-check.review-every` | duration | 7d | 1d to 90d | staff | No | How long the register may go unsigned before the console home says so |
| `bar.sales.max-discount-percent` | integer (percent) | 100 | 0 to 100 | staff | No | Largest discount on a line; 0 switches discounts off |
| `bar.sales.reference-prefix` | text | B | 1 to 3 letters | staff | No | Starts a bar sale's reference, so it is not mistaken for a booking reference |
| `bar.openings.close-after` | duration | 12h | 2h to 72h | staff | No | An opening older than this, with no sale for an hour, is closed by the task |
| `bar.tabs.enabled` | boolean | false |  | staff | No | Offer bar tabs on the till and "My bar tab" in the members' area |
| `bar.tabs.limit` | money | 5000 | 0 to 100000 | staff | No | The most a new floating tab may reach; 0 means no limit |
| `bar.tabs.staff-limit` | money | 3000 | 0 to 100000 | staff | No | The most a staff tab may reach; 0 means no limit |
| `bar.tabs.staff-reminder-after` | duration | 30d | 1d to 365d | staff | No | When the holder of an unpaid staff tab is first reminded; then weekly |
| `bar.tabs.self-service-restricted` | boolean | false |  | staff | No | Offer products that need an age check in self-service |
| `bar.stock.enabled` | boolean | true |  | staff | No | Off: the till and prices work with no stock screens and no movements |
| `bar.stocktake.blind` | boolean | true |  | staff | No | Hide expected levels from the person counting |
| `bar.stocktake.self-approve-under` | money | 0 | 0 to 100000 | staff | No | A person may approve their own count when the absolute variance value is at or under this; 0 means always a second person |
| `bar.till.quick-cash-amounts` | list of money | 500, 1000, 2000 | 1 to 6 values | staff | No | Buttons for cash tendered |
| `bar.desk.enabled` | boolean | true |  | staff | No | Show the bar panel on the box office desk |
| `bar.retention.age-checks` | duration | 730d | 180d to 3650d | staff | No | How long register rows are kept before the retention sweep deletes them |
| `bar.retention.tab-names` | duration | 400d | 30d to 3650d | staff | No | How long after a bar tab closes its name, address and digest are kept before the sweep erases them |

Rules across settings: `challenge-age` is at least `minimum-age`. The currency is the core's `core.locale.*` setting, read and never redeclared. Refund limits, the cash float and cash variance are Payments' settings and apply to bar payments unchanged. Whether an outlet is self-service, and what its sellers must meet, are fields on the outlet, set with `bar.outlet.manage`.

**Preset differences.** Only values that differ from the defaults are listed. `student-society`: `bar.tabs.enabled` true; `bar.stocktake.self-approve-under` 0; `box-office-staff` holds `bar.sale.sell`, because the desk sells drinks; `committee-member` holds `bar.tab.hold`. `amateur-company`: `bar.stock.enabled` false (a tea-and-raffle table needs prices, not a cellar). `small-venue`: `bar.stocktake.self-approve-under` 2000.

## Record types

| Record type | Table | Parent | Owner column | Holds when |
| --- | --- | --- | --- | --- |
| `bar.outlet` | `bar_outlets` |  |  |  |
| `bar.opening` | `bar_openings` | `bar.outlet`; and `core.performance` when it has one | `opened_by` | The person who opened it may close it |
| `bar.sale` | `bar_sales` | `bar.opening` | `sold_by` | A seller owns their own bar sale |
| `bar.tab` | `bar_tabs` | `bar.outlet`, optional: a staff tab has no outlet | `holder_account` | The holder may not write off their own tab |
| `bar.product` | `bar_products` |  |  |  |
| `bar.stock-item` | `bar_stock_items` |  |  |  |
| `bar.stocktake` | `bar_stocktakes` |  | `submitted_by` | The counter owns their count |

A grant on an outlet covers its openings, their bar sales and its floating tabs, so a visiting company running the kiosk can be given `bar.sale.sell` and `bar.report.view` on that outlet alone. A grant on a production covers the openings of its performances for `bar.report.view`.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `bar.sale.sell` | `bar.outlet` | normal |  |  | Use the till and the desk panel; void and park your own unpaid sales; record an age check or a refusal; settle a bar tab | `bar-manager`; fact `front-of-house.on-shift` where the theatre maps it; `box-office-staff` under the `student-society` preset |
| `bar.sale.view` | `bar.sale` | normal | grants |  | See bar sales and their lines | `bar-manager`, `finance-officer`, `committee-member` |
| `bar.sale.void-any` | `bar.sale` | normal | refuses | `sale.view` | Void another person's unpaid sale, or take a sale off a bar tab | `bar-manager`, `front-of-house-manager` |
| `bar.sale.discount` | `bar.outlet` | normal |  |  | Discount a line, with a reason | `bar-manager`, `front-of-house-manager` |
| `bar.sale.use-restricted-price-list` | `bar.outlet` | normal |  |  | Choose a restricted price list at the till | `bar-manager`; fact `front-of-house.on-shift` where the theatre has staff or committee prices |
| `bar.sale.refund` | `bar.sale` | normal |  | `sale.view` | Request a refund of a paid bar sale. Approval and sending follow Payments' abilities | `bar-manager`, `front-of-house-manager` |
| `bar.sale.override-requirement` | `bar.outlet` | privileged |  |  | Allow a seller who does not meet the outlet's requirement to sell for this opening. Audited with who allowed it and for whom; never for yourself | `bar-manager`, `front-of-house-manager` |
| `bar.opening.manage` | `bar.outlet` | normal | grants (close) |  | Open and close an outlet | `bar-manager`, `front-of-house-manager`; fact `front-of-house.on-shift` at a small theatre |
| `bar.tab.open` | `bar.outlet` | normal |  |  | Open a floating tab, and charge bar sales to a floating or a staff tab at the till | `bar-manager`; fact `front-of-house.on-shift` where the theatre maps it |
| `bar.tab.hold` |  | normal |  |  | Have a staff tab and add to it yourself at a self-service outlet. It grants nothing over anyone else's tab | `committee-member` under the `student-society` preset; otherwise by grant |
| `bar.tab.view` | `bar.tab` | normal |  |  | See bar tabs and the names on them | `bar-manager`, `finance-officer` |
| `bar.tab.write-off` | `bar.tab` | privileged | refuses | `tab.view` | Write off a bar tab or raise its limit; never your own tab or one you opened. Also the redact ability for `bar_tabs` | `bar-manager`, `finance-officer` |
| `bar.stock.view` |  | normal |  |  | See stock levels and movements | `bar-manager`; fact `front-of-house.on-shift` |
| `bar.stock.receive` |  | normal |  | `stock.view` | Record deliveries and move stock between locations | `bar-manager` |
| `bar.stock.waste` |  | normal |  | `stock.view` | Record wastage | `bar-manager`; fact `front-of-house.on-shift` |
| `bar.stock.count` |  | normal |  | `stock.view` | Start, enter and submit a stocktake | `bar-manager` |
| `bar.stocktake.approve` | `bar.stocktake` | privileged | refuses | `stock.view` | Approve a stocktake and adjust stock; never your own above the limit | `bar-manager`, `finance-officer` |
| `bar.product.manage` |  | normal |  |  | Categories, products, variants, recipes, stock items | `bar-manager` |
| `bar.price.manage` |  | privileged |  |  | Price lists and prices, including a list's percentage | `bar-manager`, `finance-officer` |
| `bar.outlet.manage` |  | normal |  |  | Outlets and stock locations, an outlet's sell requirement and whether it is self-service | `bar-manager` |
| `bar.report.view` | `bar.outlet`, `core.production` | normal |  |  | Reports and opening summaries | `bar-manager`, `finance-officer`, `committee-member`; `production-lead` and `visiting-company` by grant on their production |
| `bar.report.export` |  | privileged |  | `report.view` | Export reports and the licensing file | `bar-manager`, `finance-officer` |
| `bar.age-check.view` |  | normal |  |  | Read the refusals register | `bar-manager`, `front-of-house-manager` |
| `bar.age-check.review` |  | normal |  | `age-check.view` | Sign the refusals register as checked | `bar-manager` |
| `bar.settings.manage` |  | privileged |  |  | Change bar settings | `administrator` |

- "Owner" follows Foundations: `grants` means the owner of the record may do it without the ability; `refuses` means the owner may not do it to their own record even with the ability. That a tab's opener may not write it off is a guard in the bar's own service.
- The holders are keys of Identity's fifteen preset roles. The bar declares no role and needs none Identity does not have. No preset is plain bar staff: at a theatre with Front of house switched on, the people behind the bar hold these abilities through the fact `front-of-house.on-shift`; without it, a theatre grants `bar-manager` or makes a role of its own.
- Taking money needs Payments' abilities as well: `payments.session.open` and `payments.attempt.attest`. The setup step for the bar checks that whoever holds `bar.sale.sell` holds those, and says who does not.
- None is marked `fresh`. A price change is privileged and audited; it does not need a fresh sign-in.

## Facts

The bar declares one fact.

| Fact | On | Standing | True when |
| --- | --- | --- | --- |
| `bar.tab-holder` | none (site-wide) | true | The account has `bar.tab.hold` or holds an open staff tab. It opens the members' area for a holder with no other standing, and grants no ability |

It relies on facts and requirement sources from modules it only `uses`, so it works without them:

| From | What | A theatre uses it for | Without that module |
| --- | --- | --- | --- |
| Front of house | Fact `front-of-house.on-shift` | Mapping `bar.sale.sell`, `bar.tab.open` and `bar.stock.waste` to tonight's confirmed volunteers | Selling needs an ordinary grant |
| Training | A requirement reference such as `training:tcmp_...`. Not a fact, and it never grants an ability | An outlet's `sell_requirement`, checked through `requirements.check` (part 3) | The check answers unavailable, the bar treats that as met, and the outlet's form says the requirement is not being enforced |
| Membership | A requirement reference such as `membership:<the type's id>` | A price list's `customer_requirement`, in the later story BAR-56 | Unavailable is treated as not met: nobody gets the member price |

## Secrets and credentials

The bar reaches no outside service and holds no credential; card readers and providers are Payments'. It declares one secret key name, `bar.tab-receipt`, held by the core's key store and used only through the core's `addressDigest`.

## Notification types

| Type | To | Transactional |
| --- | --- | --- |
| `bar.stocktake-awaiting-approval` | Holders of `bar.stocktake.approve` | No: a preference |
| `bar.stock-item-low` | Holders of `bar.stock.receive` | No: a preference |
| `bar.opening-closed-automatically` | The person who opened it | No: a preference |
| `bar.tab-receipt` | The email address on a floating tab; the holder of a staff tab, in their notifications | Yes |
| `bar.staff-tab-reminder` | The holder of an unpaid staff tab | Yes: it is about money they owe |
