# 1. Scope and glossary

The module `bar` sells drinks, snacks, programmes and merchandise, keeps their prices, and counts their stock. It takes no money itself: every sale is a part of a Payments intent, so one card-reader payment can cover tickets and drinks, and every sale posts to the Finance ledger.

## In scope

| Area | What the module does |
| --- | --- |
| Products | Categories, products and their variants (a pint and a half, a small and a large glass), with an age-restricted mark |
| Prices | Price lists (Standard, and others such as Committee or Staff), with every price change kept as history. A list may be a percentage off Standard |
| Outlets and openings | The places that sell (a bar, a kiosk, the box office desk) and each period of trading, tied to a performance or free-standing such as a social |
| Till | A live-mode till for a phone or tablet: build a sale, take one payment through Payments, give change, void, park |
| Desk basket | A panel on the box office desk through `payments.desk-basket`, so drinks join the ticket payment |
| Who may sell | An outlet may name a requirement its sellers must meet, such as bar training, with an audited override |
| Age checks and refusals | A prompt on restricted products and a refusals register in the layout a UK premises licence expects: what was refused, why, by whom, and a manager's regular signature |
| Bar tabs | A running bill under a name, paid once in full: a staff tab a holder adds to from their own phone, and a floating tab opened by bar staff for one night, with a receipt by email |
| Stock | Stock items in whole base units, locations, deliveries, wastage with reasons, stocktakes with approval, and automatic deduction on sale |
| Refunds | Refund of a paid sale or line through Payments, by the method that paid, with the stock returned or written off |
| Money | One ledger entry set per sale to bar income accounts, per category where the theatre wants it |
| Reports | Sales by opening, product and category; bar tabs owed; stock levels and variance; a licensing export |

## Out of scope

| Left out | Where it belongs |
| --- | --- |
| Taking, attesting and refunding money; till sessions and cashing up; the card reader | Payments. The bar never talks to a provider |
| The ledger, periods, statements | Finance |
| Tickets, reservations, the desk screen itself | Box office. The bar adds a panel to that screen and knows nothing about tickets |
| Who is on shift tonight | Front of house, through the fact `front-of-house.on-shift` |
| Whether a person is trained to serve | Training, through `core.requirement`: an outlet may name a requirement its sellers must meet |
| Member prices decided by membership | Membership, through `core.requirement on a price list` (later release) |
| Props, costume and technical kit | Inventory. Bar stock is consumable goods for sale only |
| Purchase orders, supplier invoices, stock valuation in the ledger | Later story BAR-55 |
| Tax on sales | Not supported in the first release, as Finance rules (`finance.tax.registered`) |

## Releases

Part 7 marks every story. In short:

| Release | Contents |
| --- | --- |
| First | Products, variants, price lists, outlets, openings, the till, the desk panel, combined payment with tickets, the sell requirement, age checks and the refusals register, bar tabs of both kinds, refunds, income posting, stock with deliveries, wastage and stocktakes, the core reports |
| Later | Pre-ordered interval drinks, choices on a product (mixers), recipes with several ingredients, cash sales while offline, stock value and cost of sales in the ledger, member prices from Membership, deposits on reusable cups, a receipt by email for an ordinary bar sale, a public price list. For bar tabs: part payment, paying a staff tab online, settling a tab on the box office desk with tickets, and invoices for a tab |

Ten first-release stories (BAR-01 to BAR-05, BAR-10 to BAR-12, BAR-14 and BAR-22) are built in roadmap phase 3, straight after Box office's desk stories, because NNT's one card reader takes tickets and drinks together. The rest of the first release follows in the next phase.

## Glossary

These words are the bar's. Words owned elsewhere keep their owner's meaning: payment intent, part, attempt, till session (Payments); posting, entry (Finance); order, reservation (Box office); performance, operating day, vocabulary, term (Core domain); account (Identity).

| Word | Meaning |
| --- | --- |
| Product | A thing a customer asks for by name: "House lager", "Programme" |
| Variant | One sellable size or form of a product, with its own price: "Pint", "Half". Every product has at least one |
| Category | A group of products for the till grid and for reports: Draught, Wine, Soft drinks, Snacks, Merchandise |
| Price list | A named set of prices for variants. "Standard" always exists |
| Outlet | A place that sells: "Foyer bar", "Interval kiosk", "Box office desk" |
| Opening | One period of trading at one outlet, from opened to closed. It may belong to a performance |
| Bar sale | One customer's basket at an outlet, and its payment. Always "bar sale" in shared documents, because Box office has a "sale state" and a `sale` id prefix |
| Sale line | One variant, a quantity and the price fixed when the line was written |
| Parked sale | An unpaid bar sale set aside under a label so the next customer can be served |
| Reversal | The record that a paid line, or part of it, was refunded |
| Stock item | A thing that is counted: a keg, a bottle of wine, a can, a chocolate bar |
| Base unit | The whole unit a stock item is counted in: each, millilitre or gram |
| Recipe | What one variant uses up when sold: 568 ml of the lager keg |
| Stock location | Where stock is kept and counted: "Bar", "Cellar" |
| Stock movement | One change to a stock level, never edited: delivery, sale, wastage, adjustment, transfer |
| Stock level | The running total of movements for one item in one location. It may be negative |
| Delivery | Goods received, as lines of stock items and quantities |
| Wastage | Stock written off with a reason: spilled, out of date, line cleaning |
| Stocktake | A count of one location, compared with the stock levels, then approved |
| Variance | Counted less expected at a stocktake |
| Age check | The record that staff were prompted on a restricted sale and what they did |

Words for bar tabs:

| Word | Meaning |
| --- | --- |
| Bar tab | A running bill under a name. Bar sales are charged to it and it is paid once, in full. Always "bar tab", never "tab" alone |
| Charge | Putting a bar sale on a bar tab instead of taking payment. The drinks are handed over and stock moves |
| Settle | Paying a bar tab: one payment covers every bar sale on it |
| Write off | Closing a bar tab that will not be paid, by a second person, with a reason |
| Staff tab | A bar tab held by one person with an account. It runs across nights up to a limit, and the holder may add to it by self-service |
| Floating tab | A bar tab opened by bar staff under a name at one outlet, and paid before that outlet closes |
| Self-service | A staff tab holder charging products to their own tab from their own phone, with no seller and no till |
| Refusals register | The on-screen name of the age-check register: every age check and every refusal, with a manager's signatures |

## Words that meet other modules

- "Sale" alone is avoided. Box office's `sale` prefix names its performance sales record; this module says "bar sale", and never "order".
- "Session" is always Payments' till session. The bar's own period of trading is an "opening".
- "Tab" alone is avoided, because record tabs and document tabs already use the word. The running bill is a "bar tab" on screens, in code and in shared documents.
- "Stock" is the bar's. Inventory, when specified, should say "item" or "asset" for props and kit.

The integration thread ruled on these for the shared glossary on 16 November: "bar sale", "opening", "outlet", "parked sale", "stock item" and "bar tab" stand as written here.
