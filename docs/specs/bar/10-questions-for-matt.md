# 9. Questions for Matt

Nine questions were put to Matt on 16 November 2026, each with a recommendation. All nine are decided, and parts 1 to 8 are written to the decisions. The table gives each decision. The sections below keep each question as it was asked, with the decision first.

**All nine questions are answered.** On 16 November Matt accepted every recommendation still open, other than where he had already said otherwise. The state of each:

| Question | Decided |
| --- | --- |
| 1. When the bar is built | Ten stories (BAR-01 to 05, 10 to 12, 14, 22) join phase 3 straight after Box office's desk stories; the rest follows in the next phase |
| 2. Stock depth | Whole units and simple measures. Wine by the glass now; cider from mini kegs possible |
| 3. Stock never blocks a sale | Agreed |
| 4. Bar tabs | In the first release, as staff tabs and floating tabs. Self-service leaves out alcohol; a staff tab is paid whole at the till; money owed stays out of the ledger until paid |
| 5. Selling offline | Later. Offline, the till says payments need a connection |
| 6. Ledger | Income only now; stock value later |
| 7. Age check and refusals | As specified, with the refusals log: product, reason and a manager's signature. The description of the person stays off |
| 8. Drinks at the desk | The `student-society` preset gives the box-office role `bar.sale.sell` on the desk outlet |
| 9. Prices and training | Committee price list at 25% off everything, chosen by hand; a training requirement per outlet in the first release; automatic member prices later |

One thing only Matt can check, which does not hold up the build: whether the conditions on NNT's premises licence ask for a description of the person on each refusal. If they do, it is one setting.

## 1. When is the bar built?

**Decided: A.** Ten stories (BAR-01 to BAR-05, BAR-10 to BAR-12, BAR-14 and BAR-22) join phase 3 straight after Box office's desk stories. The rest of the first release follows in the next phase.

The paper puts Bar and kiosk after Box office, in tier 2. But your one card reader takes tickets and drinks together, so a box office without the bar panel would leave the desk using two systems on show nights.

| Option | What happens |
| --- | --- |
| **A. Step 1 of the bar joins phase 3 (recommended)** | Products, prices, the till, the desk panel and income posting (10 stories) are built straight after Box office's desk stories. Everything else follows in the next phase |
| B. All of the bar after phase 3 | Box office ships first; NNT rings drinks through the reader by hand as an attested amount until the bar arrives |
| C. Every first-release story in phase 3 | The whole bar ships with the box office; phase 3 grows by about a third |

## 2. How deep is stock in the first release?

**Decided: A.** NNT sells wine by the glass, which option B could not track. No draught beer is sold, but cider from mini kegs is being considered, and A covers it: the keg is stocked in millilitres and a pint or a half takes its measure.

| Option | What happens |
| --- | --- |
| **A. Whole units and simple measures (recommended)** | Each variant uses one stock item in a whole quantity: 1 can, 568 ml of a keg, 175 ml of a bottle. Deliveries, wastage and stocktakes as specified. Covers bottles, cans, snacks, draught and wine by the glass |
| B. Each-only | Stock counts only things sold whole. Draught and wine by the glass are not stock-tracked. Simpler screens; less use to a real bar |
| C. Full recipes | Several ingredients per variant (a spirit and a mixer), kegs counted by weight. More set-up for every product; specified as a later story (BAR-53) |

Is draught beer or wine by the glass sold at NNT? If neither, B is enough for you, though A costs little more.

## 3. Stock never blocks a sale. Agreed?

**Decided: agreed.** Stock never blocks a sale, and no setting is added.

The specification lets a stock level go below zero and still completes the sale, showing the shortfall in red on the stock screen. The alternative, refusing to sell what the system thinks is gone, stops the till whenever a delivery was not entered. **Recommended: never block.** A theatre that disagrees would need a setting, which is not drafted.

## 4. Tabs and parked sales

**Decided: B, in two kinds.** Bar tabs are in the first release alongside parked sales (stories BAR-24 to BAR-28).

| Kind | Whose | Who adds to it | When it is paid |
| --- | --- | --- | --- |
| Staff tab | One person with an account, who has been given the ability to hold one (NNT's committee) | The holder, on their own phone, without the till; and bar staff at the till | Later. It runs across nights, up to a limit, and the holder is reminded |
| Floating tab | Whoever it is opened for, by name: a director covering the cast | Bar staff only, for anyone who asks | Before the outlet closes that night, always |

Also decided:

- **Receipts.** A floating tab can carry an email address and the receipt is sent there when the tab is paid. The tab then shows to the account whose verified address matches. Bar staff never set an account from a typed address, and the till never reveals whether an address has one.
- **Self-service leaves out alcohol.** A staff tab holder serving themselves sees only products that need no age check; alcohol goes on a staff tab at the till, with a seller. A setting can change this.
- **A staff tab is paid at the till,** in one payment for the whole amount. Paying it online is later. The holder is reminded after 30 days, and the limit defaults to 30.00.
- **Money owed stays out of the ledger** until paid, and a Bar tabs owed report shows it.
- **Self-service happens on the holder's own phone.** NNT may put a QR code on the bar that links to "My bar tab"; the platform neither makes nor needs it.

Because of this decision the bar holds one piece of customer data: the name on a bar tab, erased after a retention period.

| Option | What happens |
| --- | --- |
| **A. Parked sales now, named tabs later (recommended)** | Staff can set an unpaid sale aside under a label ("Table 4") and recall it the same night. Nothing is owed by a named person, and everything unpaid is voided when the outlet closes |
| B. Named tabs in the first release | A running bill for a person or a company, settled later. Adds the only customer data the bar would hold, and a debt the theatre must chase |

Two follow-up questions were asked with the first answer. Both are settled:

- **May a bar tab run across several nights?** Decided: it depends on the kind. A staff tab runs across nights. A floating tab is settled or written off before its outlet closes. No setting changes this (`bar.tabs.must-settle-at-close` was drafted and is withdrawn).
- **Should money owed on a bar tab show in the accounts before it is paid?** Decided: no. Stock leaves when the drinks are handed over, and income is posted when the tab is paid. A written-off tab shows in the bar's reports, not as a debt in the ledger.

## 5. Selling without a connection

**Decided: A.** Selling offline is later (BAR-54). Offline, the till says payments need a connection.

Interface's rule is that live mode keeps working offline. For the till that would mean cash sales recorded on the device and sent later; card payments cannot work offline at all.

| Option | What happens |
| --- | --- |
| **A. Later (recommended)** | Offline, the till stays on screen and a sale can be built, but Pay says "Payments need a connection". Staff fall back to a cash tin and ring it up afterwards |
| B. Cash offline in the first release | Cash sales queue on the device with their own ids and settle on reconnection. Adds a second settlement path, and a cash-up that may be missing sales still on a phone |

## 6. How much of the bar is in the ledger?

**Decided: A now, B later.** Income only in the first release. Stock value, cost of sales, wastage and variance in the ledger are the later story BAR-55.

| Option | What happens |
| --- | --- |
| **A. Income only (recommended)** | Each sale posts bar income, by category if wanted. Stock has quantities and a last cost for reports, but no value in the accounts. Deliveries are not purchases in the ledger |
| B. Stock value too | Deliveries post stock as an asset, sales post cost of sales, wastage and variance post as expenses. Proper bar accounts, but it needs purchase costs entered on every delivery and Finance's expenses and invoices, which are not specified yet |

## 7. The age check

**Decided: as specified, with the standard UK premises licence refusals log.** There is no single statutory form, so the register follows the layout licensing authorities commonly ask for: date and time, what was refused, why, who refused, and a regular check signed by a manager.

- Each refusal records the product refused and a reason from a list the theatre can edit, which starts with No ID, ID not accepted, Under age, Buying for someone under age, Already drunk and Other.
- Because "already drunk" has nothing to do with age, a refusal can be recorded from any sale or with no sale, and the register is called the refusals register on screen.
- A manager signs the register as checked for a period, and the licensing export shows those signatures.
- A short description of the person refused ("male, about 16, red jacket") is common on paper logs. It is an optional field, off by default, because it is the one thing in the register about a customer. It stays off unless NNT's licence conditions or licensing officer ask for it.

The question as asked:

The specification prompts once per sale when the first restricted product is added ("Does the customer look under 25?"), and records the outcome, the member of staff and the time. It never records anything about the customer. Refusals can also be recorded without a sale.

- **Recommended: as specified, on by default, with 18 and 25 as settings.**
- Is a refusals log something your licence or your venue asks for? If so, tell me what it must contain and I will match the export to it.

## 8. Who sells drinks at the box office desk?

**Decided: as recommended.** Under the `student-society` preset the `box-office-staff` role holds `bar.sale.sell`.

The bar panel appears on the desk for anyone holding `bar.sale.sell`. At a theatre like yours, the same volunteer sells tickets and drinks.

- **Recommended:** the `student-society` preset gives the box-office role `bar.sale.sell` on the desk outlet, so it works on day one; other presets leave it to the theatre.
- The age check still applies at the desk. If a theatre requires bar training before selling alcohol, question 9 covers it.

## 9. Staff prices, member prices and training

**Decided: as recommended, with a percentage price list.** NNT's committee members get 25% off. A price list can be a percentage off Standard, so NNT sets up one list, "Committee", at 25% and never maintains its prices by hand. It applies to everything the outlet sells. The seller chooses it at the till, and it is a restricted list, so only people given the ability can apply it. A training requirement per outlet is in the first release (BAR-23). Applying a price automatically to an identified member stays the later story BAR-56.

| Matter | Recommended |
| --- | --- |
| Staff or member prices | First release: extra price lists a seller chooses by hand, with an ability guarding restricted ones. Later: a price list names a requirement, such as a membership type, and the till applies it to an identified customer (BAR-56) |
| Discounts | First release: a line discount with a reason, by ability, capped by a setting |
| Training before serving | First release (BAR-23): an outlet names a requirement its sellers must meet, checked through the kit's requirement check as Foundations ruled on 16 November. The bar refuses, or a manager overrides for that opening. With Training switched off nothing is enforced, and the screen says so |

Does NNT have staff or member prices at the bar today?

## Not asked, because the recommendation is plain

- Tax on sales is unsupported, as in Finance.
- Refund limits, two-person approval, the float and cash variance are Payments' settings and apply to the bar unchanged.
- The only customer detail the bar keeps is the name on a bar tab (question 4).
