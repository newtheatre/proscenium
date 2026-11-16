# 7. Stories

48 stories: 39 in the first release, of which 8 are gate stories and 31 are not, and 9 later. The ids run from BAR-01 to BAR-58 because ten ids are not used: BAR-06 to BAR-09, BAR-29, BAR-39 and BAR-47 to BAR-50. No story is missing. The gate is one sentence: a drinks-only sale and a drinks-with-tickets sale each take one payment, move stock once, post income once and can be refunded.

## How to read this part

Each story is small enough to build and prove on its own. "Rests on" names stories in this and other specifications by id. A gate story must be finished and proved before the work that rests on it starts. Tests named in the last column are in part 8.

## Set-up

| Id | As | I want | Done when | Release | Rests on | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| BAR-01 | a developer | the `bar` module's manifest, 22 tables, triggers and id prefixes | The module builds, migrates and passes `bun run check`; every trigger in part 2 has a test that provokes it | First, gate | F-01 to F-10 | T-D1 to T-D10 |
| BAR-02 | a bar manager | to set up outlets and stock locations | I can add, edit and retire both; one desk outlet at most; an outlet with bar sales cannot be deleted | First | BAR-01, UI list and form pages | T-I1 |
| BAR-03 | a bar manager | to set up categories, products and variants | A product has at least one variant; reordering works by keyboard; a product with bar sales is retired, not deleted | First | BAR-01 | T-I2 |
| BAR-04 | a bar manager | price lists and prices with history | Changing a price writes a new row; a future-dated price takes effect at its time; fall-back to Standard works; bulk raise previews old and new. A price list can be a percentage off Standard: it has no prices of its own and follows Standard at once, rounding to the nearest minor unit | First | BAR-03 | T-U1, T-I3 |
| BAR-05 | an administrator | setup steps and the bar's income accounts | The setup checklist shows the bar's four steps; `bar.income` exists in Finance through `finance.system-account`; a category can name another income account that belongs to the bar | First | BAR-01, FIN-01 | T-I4 |

## Selling

| Id | As | I want | Done when | Release | Rests on | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| BAR-10 | bar staff | to open and close an outlet | One open opening per outlet; closing voids open and parked sales and is refused while one awaits payment | First, gate | BAR-02 | T-I5, T-N4 |
| BAR-11 | bar staff | to build a bar sale on the till | Lines add, change and remove; the total is the trigger's; a repeated request with the same client key makes one sale; the till works on a phone and a tablet at 48 pixel targets, with the shared keypad | First, gate | BAR-04, BAR-10, UI-05 and UI-06 (live mode), UI-36 (`LiveKeypad`) | T-I6, T-E1 |
| BAR-12 | bar staff | to take payment for drinks alone, by cash or an attested card payment | One intent with one part; the settle handler marks the sale paid in Payments' batch; a mismatched total is refused quoting both; change is shown | First, gate | BAR-11, PAY-01 to PAY-05 | T-I7, T-N1, T-E1 |
| BAR-13 | bar staff | to take payment on the card reader | "Waiting for the card reader"; an unknown outcome keeps the sale awaiting payment with Check again and Cancel; a second method is offered only after a known failure | First | BAR-12, Payments' reader story | T-I8, T-E2 |
| BAR-14 | box-office staff | to add drinks to a ticket payment at the desk | The bar panel appears with `bar.sale.sell`; one total; one attempt; tickets issued and the bar sale paid in one batch, or neither; removing the drinks rebuilds the payment | First, gate | BAR-12, BO-30 to BO-36, R-1 to R-7, the `payments.desk-basket` contract | T-I9, T-N2, T-N3, T-E3 |
| BAR-15 | bar staff | to park a sale and come back to it | A parked sale keeps its lines and prices, shows in the parked list for the opening, and can be recalled by anyone selling at the outlet | First | BAR-11 | T-I10 |
| BAR-16 | bar staff | to sell from another price list | Switching re-prices every line; a restricted list needs its ability; a line with no price on the list is refused by name | First | BAR-04, BAR-11 | T-I11 |
| BAR-17 | a bar manager | to discount a line | Needs the ability and a reason; cannot exceed the setting or the line's amount; income is posted net | First | BAR-11 | T-U2, T-I12 |
| BAR-18 | bar staff | to be prompted to check age and to record refusals | The prompt appears once per sale with a restricted line; a sale cannot be paid until answered; a refusal needs a reason, records the product refused and removes the refused lines; any sale can be refused, and a refusal can be recorded with no sale; an optional description of the person is offered only when the setting is on | First | BAR-11 | T-I13, T-N7, T-E4 |
| BAR-19 | a bar manager | to refund a paid bar sale or part of one | Reversal rows reserve the line; stock and income move only at success; a failed refund releases the reservation; a ticket refund on the same payment cannot touch the bar's part | First, gate | BAR-12, PAY refund stories, BO-50 | T-I14, T-N5, T-N6 |
| BAR-20 | bar staff | to complete a sale that totals zero | No intent and no posting; stock still moves | First | BAR-11, BAR-32 | T-I15 |
| BAR-21 | a bar manager | openings that were left open to close themselves | The task closes a stale opening, never one with a sale awaiting payment or an open floating tab, and tells the person who opened it | First | BAR-10 | T-I16 |
| BAR-22 | a treasurer | bar income in the ledger by category | The bar's entries sum to its part; they sit in the same sealed posting as the money line; each carries the opening's production and performance | First, gate | BAR-12, FIN-01, FIN-02 | T-I17, T-N8 |
| BAR-23 | a bar manager | to require something of the people who sell at an outlet, such as bar training | The outlet's form picks a requirement or none; a seller who does not meet it is refused with the reason and the remedy; a manager can override for one opening, never for themselves, and the override is audited; with the judging module off nothing is enforced and the till and the form say so | First | BAR-02, BAR-10, Foundations' `core.requirement` and the kit's requirement check | T-I31 |
| BAR-24 | bar staff | to open a floating tab under a name and add bar sales to it | With the setting on, a tab opens under a name at an open outlet; "Add to tab" charges a sale, moves stock and raises the tab's total in one batch; a charge over the limit is refused with both figures; the age check and the sell requirement still apply | First | BAR-11, BAR-18, BAR-32 | T-D10, T-I32 |
| BAR-25 | bar staff | to settle a bar tab in one payment | One intent for the whole total; on success the tab is settled, every sale on it is paid and income is posted, in one batch; a failed payment returns the tab to open; no charge lands while it is settling | First | BAR-12, BAR-22, BAR-24 | T-I32, T-N12, T-E7 |
| BAR-26 | a bar manager | bar tabs to be closed properly and their names not kept for ever | An outlet cannot close with a floating tab open; a write-off needs a second person and a reason; the Bar tabs screen lists and filters, with the owed filter; the sweep erases names after the retention period and an erasure request erases them at once, unless the tab is unpaid | First | BAR-10, BAR-24, F erasure and retention stories | T-I33 |
| BAR-27 | a committee member | a staff tab I can add to myself and pay later | With `bar.tab.hold`, "My bar tab" in the members' area shows what I owe; on my own phone I can add products from a self-service outlet without the till, and a link naming the outlet survives sign-in; alcohol is left out unless the setting allows; my price list applies; the tab runs across nights up to its limit and never blocks closing; I am reminded when it is old; a seller can add to it and settle it at the till; holding a tab alone opens the members' area for me | First | BAR-24, BAR-25, BAR-16, C notification stories, Interface's members' shell | T-I34, T-N13, T-E7 |
| BAR-28 | a person paying a floating tab | a receipt by email, and the tab in my own history if I have an account | An optional email on a floating tab; a receipt with items and total is sent when it is paid, once; the address is then cleared and only its digest kept; the tab shows to the account whose verified address matches, and the till never reveals whether one does; a matched tab is in that person's download and erasure; an unmatched one is erased by the sweep | First | BAR-25, C transactional message stories, Identity's `verifiedAddressDigests` | T-I35 |

## Stock

| Id | As | I want | Done when | Release | Rests on | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| BAR-30 | a bar manager | stock items, and what each variant uses | An item has a base unit, a pack and a count unit; a variant has one recipe line; the base unit locks after the first movement | First | BAR-03 | T-U3, T-I18 |
| BAR-31 | a developer | stock movements and levels that cannot disagree | The level changes only by the movement trigger; a direct update is refused; a replayed key moves stock once; the health check finds no difference | First, **gate** | BAR-01 | T-D5, T-D6, T-N9 |
| BAR-32 | a bar manager | stock to fall when a sale is paid and return when a refund says so | Movements ride in the settle and refund batches; an outlet with no location and a variant with no recipe move nothing; a level may go below zero and the sale still completes | First | BAR-12, BAR-19, BAR-31 | T-I19, T-N10 |
| BAR-33 | a cellar volunteer | to record a delivery | Draft lines by packs and loose units; receiving writes movements and updates last cost; received is final | First | BAR-30, BAR-31 | T-I20 |
| BAR-34 | bar staff | to record wastage with a reason | From the till menu and the stock list; a reason term is required | First | BAR-31 | T-I21 |
| BAR-35 | a bar manager | to move stock between locations | One batch writes equal and opposite movements | First | BAR-31 | T-I22 |
| BAR-36 | bar staff | to count a location on a phone | The four steps; entries save as typed and resume; blind hides expected; whole units and a part unit | First | BAR-30, UI steps page | T-U4, T-I23, T-E5 |
| BAR-37 | a bar manager | to review and approve a count | Expected is read at submission; the approver is not the submitter above the limit; approval writes one adjustment per varying line; a recount is possible | First | BAR-36 | T-I24, T-N11 |
| BAR-38 | a bar manager | to know when something is running low | The Low and Out words on the till; the stock filter; one notification per crossing | First | BAR-31, C notification stories | T-I25 |

## Records and reports

| Id | As | I want | Done when | Release | Rests on | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| BAR-40 | a bar manager | to find and read any bar sale | The list filters, exports and pages; the record shows lines, reversals, the payment link and history | First | BAR-12 | T-E6 |
| BAR-41 | a duty manager | a summary of each opening | Takings by category and method, top sellers, stock used, refusals | First | BAR-12, BAR-18 | T-I26 |
| BAR-42 | a treasurer | sales and takings reports | Sales by every dimension in part 5; takings by method reconcile to the ledger for the same period | First | BAR-22 | T-I27 |
| BAR-43 | a bar manager | stock reports | On hand, movement, variance and wastage; movement's closing level equals the level table | First | BAR-33 to BAR-37 | T-I28 |
| BAR-44 | a licence holder | the refusals register and a licensing export | The register lists and filters; a manager signs it as checked for a range of days; the export job produces the CSV for a date range, with the product refused and the signatures; the console home says when the register is overdue a check | First | BAR-18 | T-I29 |
| BAR-45 | everyone working tonight | the bar to appear where they look | The Till tile on Tonight; console home cards; the Bar record tab on a performance; the bar's figure and section for Front of house; search; four health checks | First | BAR-10, UI home, tonight-tile and record-tab points | T-I30 |
| BAR-46 | a theatre | a price list on its public site | The `BarPriceList` component renders an outlet's menu on a content page, with the age wording from settings | Later | BAR-04 |  |

## Later release

| Id | Story | Note |
| --- | --- | --- |
| BAR-51 | Interval drinks ordered ahead, online or with a reservation | A bar part on an online intent; needs a collection flow |
| BAR-52 | Choices on a product (mixer, flavour) |  |
| BAR-53 | Recipes with several ingredients, and counting a keg by weight | The table already allows several lines |
| BAR-54 | Cash sales while offline, sent when the connection returns | Adds a second settlement path |
| BAR-55 | Stock value, cost of sales, wastage and variance in the ledger | Needs purchase costs on every delivery and Finance's expenses |
| BAR-56 | Member and staff prices decided by a price list's `customer_requirement`, checked for an identified customer through the kit's requirement check | Rests on Membership and on identifying a customer at the till |
| BAR-57 | Deposits on reusable cups | A liability account and a returnable line |
| BAR-58 | A receipt by email for an ordinary bar sale | Adds a subject by email to one new table |

## The order inside the first release, and what to cut first

1. **Sell:** BAR-01 to BAR-05, BAR-10 to BAR-12, BAR-22, then BAR-14. This alone meets Matt's requirement: prices, a till, and drinks on the ticket payment, with income in the ledger.
2. **Sell properly:** BAR-13, BAR-15 to BAR-21, BAR-23 to BAR-28, BAR-40, BAR-41.
3. **Stock:** BAR-30 to BAR-38.
4. **Reports and the rest:** BAR-42 to BAR-45.

If the release has to shrink, cut from the bottom: step 4 first (keeping BAR-44, which a licence may require), then stock as a whole, since `bar.stock.enabled` already lets the till run without it. BAR-18 and BAR-19 are never cut: a bar that cannot record a refusal or return money should not open.

## Where this sits in the roadmap

The paper puts Bar and kiosk in tier 2, after Box office. Because the Nottingham New Theatre sells drinks on the ticket payment, Matt decided on 16 November that step 1 above, ten stories (BAR-01 to BAR-05, BAR-10 to BAR-12, BAR-14 and BAR-22), is built in phase 3, directly after Box office's desk stories (BO-30 to BO-36). The other 29 first-release stories follow in the next phase.
