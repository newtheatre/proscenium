# 8. Tests

69 tests in five groups. The thirteen never-regress cases are the ones that protect money and stock; each must fail the build if it ever fails, and each is written to provoke the guard, not to walk the happy path.

## How the bar is tested

| Group | Runs in | What it is for |
| --- | --- | --- |
| T-D, database guards (10) | Vitest with workerd and local D1, as Foundations' harness | Each trigger, CHECK and unique index refuses what it should |
| T-U, unit (4) | Vitest | Pure functions: prices, discounts, units |
| T-I, integration (35) | Vitest with workerd, local D1, and the test payment provider | Each service and flow through the kit, with Payments and Finance real |
| T-N, never-regress (13) | The same, tagged, and run on every pull request | The guarantees in parts 3 and 4 |
| T-E, end-to-end (7) | Playwright against a preview | The screens, at phone and laptop width, with the accessibility checks |

Payments is never mocked in T-I and T-N: the settle handler is only real if Payments calls it. The provider is Payments' test provider, which can be told to succeed, fail, stay silent or answer late.

## Never-regress cases

| Id | Name | Provokes | Must hold |
| --- | --- | --- | --- |
| T-N1 | `bar-sale-paid-once` | The same success answer delivered three times, twice at once | One sale paid, one set of movements, one set of entries |
| T-N2 | `tickets-and-drinks-settle-together` | A combined intent whose answer succeeds | The order confirmed, tickets issued and the bar sale paid in one batch; one attempt; the posting has one money line, ticket lines and bar lines, and seals |
| T-N3 | `combined-payment-fails-whole` | The bar's settle is made to throw inside a combined intent, and separately the ticket part's claims are released first | Neither part settled in the first case; in the second, the intent is unfulfilled, fully refunded, the bar sale is back to open with its lines, and no stock or bar income exists |
| T-N4 | `no-close-while-awaiting-payment` | Closing an opening while an attempt is pending or unknown | Refused; the sale and its intent are untouched |
| T-N5 | `refund-cannot-exceed-line` | Two refunds of the same line requested at the same moment, together above the line | The second is refused by the line's CHECK; reversed figures equal one refund |
| T-N6 | `ticket-refund-cannot-reach-bar-part` | On a combined payment, refunding more than the ticket part through the order | Refused by Payments' part counter; the bar's part is untouched; and the mirror case from the bar's side |
| T-N7 | `restricted-sale-needs-age-check` | Moving a sale with a restricted line to awaiting payment, or onto a bar tab, through the API with no age-check row, and with a refused one | Refused in the batch each time |
| T-N8 | `bar-entries-sum-to-part` | A sale across three categories with a discount, one category with its own income account | The bar's credits equal the part's amount to the minor unit; the posting sums to zero |
| T-N9 | `stock-level-equals-movements` | A direct update to a level; a movement replayed with the same key; 200 mixed movements | The direct update is refused; the replay inserts nothing; each level equals the sum of its movements |
| T-N10 | `stock-never-blocks-a-sale` | Selling an item whose level is zero and then below zero | The sale is paid; the level is negative; nothing is refused |
| T-N11 | `stocktake-approver-is-not-counter` | The submitter approving their own count above the limit, by the screen and by the API | Refused by the guard and by the CHECK |
| T-N12 | `bar-tab-settles-once-and-whole` | The success answer for a tab's payment delivered three times, twice at once, while a charge is attempted during settling | The tab is settled once; every sale on it is paid once; one set of income entries equal to the tab's total; the late charge is refused; no sale is left `on_tab` under a settled tab |
| T-N13 | `self-service-reaches-own-tab-only` | A holder charging to another person's staff tab, to a floating tab, at an outlet that is not self-service, and trying to void, discount or refund through the API | Each is refused; nothing is charged; a self-served sale always has the tab's holder as its seller |

One more comes from Foundations and applies here without a new test: `webhook-payload-carries-no-person` runs over every bar event marked `internal: false`.

## Database guards

| Id | Guard | Test |
| --- | --- | --- |
| T-D1 | One open opening per outlet | A second insert is refused |
| T-D2 | An opening's closed state is final | An update back to open is refused |
| T-D3 | A sale's paid and void states are final; a sale leaves open only with a line | Each refused |
| T-D4 | Lines change only while the sale is open; `amount_minor` matches its parts | Each refused |
| T-D5 | Movement sign matches its kind | A positive `sale` movement is refused |
| T-D6 | Movements are append-only; the level is trigger-kept | Update and delete refused; level follows inserts |
| T-D7 | Prices are append-only; a percentage list takes no price rows | Update and delete refused; the insert refused |
| T-D8 | Delivery and stocktake lines lock with their parent's state; received and approved are final | Each refused |
| T-D9 | One desk outlet; one live stocktake per location; unique client key, reference and barcode | Each second insert refused |
| T-D10 | Bar tab guards | A second live floating tab with the same name at an outlet, and a second live staff tab for an account, are refused; a settled or written-off tab cannot change; the total moves only by the trigger; a sale cannot enter `on_tab` on a tab that is not open or would pass its limit; a write-off by the opener or the holder is refused; a self-served sale that is not the holder's, or at an outlet without self-service, is refused; register rows change only to erase the description |

## Unit

| Id | Subject | Cases |
| --- | --- | --- |
| T-U1 | Price resolution | Newest effective row wins; a future row is ignored until its time; a null amount withdraws; fall-back to Standard on and off. A percentage list: 25% off 4.50 is 3.38; halves round up; 100% is zero; a change to Standard changes it |
| T-U2 | Discount | Cap by setting and by line amount; rounding to the minor unit; zero switches discounts off |
| T-U3 | Units | Packs and loose units to base units; base units to "4 bottles and 300 ml"; a negative level's wording |
| T-U4 | Count entry | Whole units and a part unit to base units; part by percentage; refusing a part larger than a unit |

## Integration

| Id | Flow | Checks beyond the happy path |
| --- | --- | --- |
| T-I1 | Outlets and locations | Retire against delete; a location holding stock cannot be retired |
| T-I2 | Products and variants | A product keeps at least one variant; reordering |
| T-I3 | Price changes | History kept; an open sale's existing lines keep their price after a change |
| T-I4 | Setup and accounts | `bar.income` exists; a category's own account is used; an account of another module and a retired account are refused |
| T-I5 | Opening life cycle | Desk outlet opens itself on the first desk line; closing voids open and parked sales |
| T-I6 | Building a sale | Repeated client key; inactive variant refused; variant with no price refused |
| T-I7 | Drinks-only payment, cash and attested | Total mismatch refused with both figures; no till session refused; intent cancelled returns the sale to open |
| T-I8 | Reader payment | Silent provider leaves awaiting payment; a late success settles; a second method is refused while unknown |
| T-I9 | Desk panel | `summary`, `prepare`, `release`; `release` called twice changes nothing more; panel absent without the ability or the setting; removing drinks rebuilds the intent with one part |
| T-I10 | Park and recall | Recall by another seller; parked sales voided at close |
| T-I11 | Price list at the till | Re-pricing; restricted list refused without the ability; selling from a percentage list stores the reduced price on the line and posts income net, and the discount cap does not apply |
| T-I12 | Discount | Ability and reason required; net income posted |
| T-I13 | Age check and refusals | Once per sale; a refusal needs a reason, stores the product refused and removes the refused lines; a refusal of an unrestricted sale; a refusal with no sale; the description field is absent from the screen and refused by the API when the setting is off |
| T-I14 | Refund | Part of a line; goodwill amount; returned against wasted against none; decline and failure release the reservation |
| T-I15 | Zero-total sale | No intent, no posting, stock moves |
| T-I16 | Auto-close | Stale opening closed; one with a sale awaiting payment or an open floating tab left; run twice changes nothing more |
| T-I17 | Ledger entries | Production and performance carried; a closed period resolves to the earliest open one through Finance |
| T-I18 | Stock items and recipes | Base unit locked after a movement; one recipe line per variant and item |
| T-I19 | Stock on sale and refund | No location, no recipe, stock disabled: no movements; recipe changed between sale and settle uses the current one |
| T-I20 | Delivery | Draft edits; receipt writes movements and cost; received is final |
| T-I21 | Wastage | Reason required; from the till and from the list |
| T-I22 | Transfer | Both movements or neither |
| T-I23 | Stocktake count | Resume; not counted; blind hides expected in the API response, not only on the screen |
| T-I24 | Stocktake approval | Expected read at submission; sales between submission and approval; recount; abandon |
| T-I25 | Low stock | Announced once per crossing; again after recovery |
| T-I26 | Opening summary | Figures equal the sum of its sales and reversals |
| T-I27 | Sales and takings reports | Takings by method equal the ledger's bar income for the period, refunds included |
| T-I28 | Stock reports | Movement report's closing level equals the level table |
| T-I29 | Register and export | A signature covers a range of days and records the refusal count; the export carries products and signatures; the export job is safe to run twice; the file holds no account id or name; descriptions are erased with their rows by the retention sweep |
| T-I30 | Contributions | Navigation, cards, tiles, record tab and search appear only with the abilities; each health check fails when its condition is planted |
| T-I31 | Outlet sell requirement | With a test requirement source: met sells; not met is refused with the source's reason, at the till and on the desk panel; an override lets that seller sell for that opening only and is audited; nobody overrides for themselves; unavailable is treated as met and the screen says so; a requirement alone, without `bar.sale.sell`, sells nothing |
| T-I32 | Floating tab: open, charge, settle | Stock moves at charge and not again at settle; the age check and sell requirement apply at charge; a failed or cancelled payment returns the tab to open; taking a sale off a tab voids it and returns its stock |
| T-I33 | Bar tabs: close, write off, erase | Closing is refused with an open floating tab and never by a staff tab; a written-off tab posts no income and appears in the report; the sweep and an erasure request clear the name and keep the row; an unpaid tab holds the erasure; no event payload carries the name |
| T-I34 | Staff tab | It opens itself on the first charge; one per account; restricted products are absent from self-service and refused by the API unless the setting is on; the holder's price list applies; the limit refuses the charge that would pass it; the outlet closes with the tab open; the reminder is sent once when due and then weekly; a seller charges and settles it at the till; an outlet with no opening opens itself for a self-served charge; an account whose only standing is `bar.tab-holder` reaches "My bar tab", and one without `bar.tab.hold` gets page not found |
| T-I35 | Floating tab receipt | The receipt goes to the address given and lists items and total, once even when the settle answer is replayed; the address is cleared when the receipt is sent and the digest stays; a signed-in person sees a floating tab only when the digest matches one of their verified addresses, and an unverified address of theirs shows nothing; no response at the till differs by whether the address has an account; the matched tab is in that person's download; their erasure clears its digest and name and keeps the money lines; the sweep erases an unmatched one |

Two checks apply to every route and are written once: each route declares an ability and refuses without it, and each refusal carries a reason and a remedy (Foundations R1 and R2).

## End-to-end

| Id | Journey | Widths | Also checks |
| --- | --- | --- | --- |
| T-E1 | Open the foyer bar, sell two drinks and a snack for cash, see the change | Phone, tablet | 48 pixel targets; the result band has a word and a shape; keyboard only |
| T-E2 | Pay on the reader, with the provider silent then answering | Tablet | "Waiting for the card reader"; Check again |
| T-E3 | At the desk, take payment for a reservation and add two drinks; one total; confirmation lists both | Laptop | The combined total on the button; the bar panel absent for a person without the ability |
| T-E4 | Age check: clearly over; ID checked; refused with a reason | Tablet | Focus moves into and out of the sheet correctly |
| T-E5 | Count the cellar on a phone, leave, resume, submit; approve on a laptop as another person | Phone, laptop | Blind count shows no expected figure |
| T-E6 | Find a bar sale and refund one line | Laptop | The button names the amount; the refusal page when the limit needs a second person |
| T-E7 | Open a floating tab for a name, add two rounds, settle on the reader. Then, signed out on a phone, follow a link to "My bar tab" that names an outlet, sign in, add a snack and see what is owed | Tablet, phone | The result band names the tab and its total; "Settle 18.40" carries the amount; the name is announced to a screen reader; the link lands on the same address with the outlet kept |

Every end-to-end journey runs the automated WCAG 2.2 AA checks on each screen it visits, in light and dark.

## Proofs

No new technical proof is needed. The one hard guarantee, several owners settling in one batch, rests on Payments' intent parts, and T-N2 and T-N3 prove the bar's side of it against the real Payments module. Stock uses the trigger-kept counter the Box office proof already showed on deployed D1, without its CHECK, since a level may go below zero. Foundations' erasure walking test must cover `bar_tabs` by the contributor route as well as the email subject.
