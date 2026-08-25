# Bar (sales, stock and Challenge 25) design

**Status: agreed, largely built.** Drafted August 2026 by Matt Adcock (ITM 26/27); agreed
2026-08-21 and reconciled against the code the same day. Amended 2026-08-22 to add tabs (§4.6). Depends on the
[show night screen design](./11-show-night-screen-design.md) for the route shell, role scoping and
QR/ref lookup, and on the [access, staffing & end-of-night design](./12-access-and-staffing-design.md)
(referred to below as *12-access-and-staffing*) for the rota's `BAR` shift and the end-of-night
report this feeds. A clickable mockup of every screen exists (artifact *Proscenium Bar*, Aug 2026).

## 1. What this is, and what it is not

The NNT bar today runs on a single SumUp card reader, which is also the device ticket money is
taken on. SumUp is used purely as "type a number, take a card": it does not know what was sold,
cannot hold stock, and bar takings are currently worked out as *SumUp total minus tracked ticket
sales*. Challenge 25 refusals are recorded in a paper register.

**The SU's rules fix SumUp as the payment device.** We cannot replace it and this design does not
try. Instead, Proscenium gains a **bar module** (under `/foh`, see §2.3) that is the *till
that does not take money*: it builds the basket, shows the one figure to type into SumUp, and
records the itemised sale, the tender, the stock movement and the person who rang it up. That
division (the reader charges, this app records) is
[ADR-0024](./decisions/0024-sumup-stays-a-manual-reader.md), and it is not a stopgap. Around
that sit a stock ledger (deliveries, stocktakes, variance, cost and GP), a Challenge 25 log with
an ID-check tally, and a reconciliation that explains the SumUp reader's daily total to the penny.

Three goals, in order:

1. **Know what was sold.** Itemised sales per performance, per product, per tender, per person.
2. **Know what we have.** A stock ledger the bar manager and Treasurer can trust, and variance
   they can question.
3. **Replace the paper refusals register** with something that is always with the bar staff,
   auditable, and exportable in the shape a licensing officer expects.

And one quality-of-life promise that drives adoption: **nobody does mental arithmetic on a show
night.** The basket adds up; ticket money owed can be pulled into the same basket so a mixed
transaction is one number into SumUp; the end of the night is "type the Z-total, does it match?".
Everything is card or comp: there is no cash anywhere in this design.

**Not in scope:** card payment of any kind (SumUp's API is not used: the reader stays a manual
device), **cash** (the theatre takes none; charity collection buckets are outside this system
entirely), customer-facing ordering, table service, a loyalty scheme, supplier ordering/purchase
orders, and anything resembling an accounts package. Sales and stock export to CSV; the Treasurer's
spreadsheet remains the book of account.

## 2. Where it lives, and how a night actually runs

### 2.1 One counter, one till

The FOH design settled that **the door never sells: direct to the bar**. Taken seriously, that
means there is one money-taking point in the building: the counter, with the laptop and the
SumUp. So this is not a bar till beside a ticket till. It is **the counter till**, with two tabs
over one basket:

- **Tickets**: scan/ref/name lookup of a reservation (the same lookup `/foh` uses) drops the
  amount owed into the basket; **Walk-up** sells new tickets (performance, type, quantity) via
  the existing walk-up sale function. Both call the existing box office functions; this screen
  adds no ticketing logic of its own.
- **Bar**: the product tiles.

One basket, one gold figure to type into SumUp, one tender tap. That tap writes one
**transaction** (§3) whose lines may be ticket payments, walk-up sales, bar items or any mix.
Nobody splits a customer across two SumUp transactions and nobody subtracts tickets from a
total again.

**The till takes money; the desk changes bookings.** That is the entire division of labour, and
it is what keeps the till simple. The till's Tickets tab can do exactly two things: pay what is
owed on an existing reservation, and sell a plain walk-up. Changing ticket types or quantities,
moving a booking to another performance, refunds, ticket comps, group discounts, pass sales:
all of it stays on `/admin/boxoffice`, and the till's reservation card carries an *Edit on desk*
link for the one-in-twenty case. If a customer needs a change and a payment, the desk makes the
change, then the till (or the desk's own pay button) takes the money. Do not grow the Tickets tab.

### 2.2 A night, end to end

| When | Who | What happens |
|---|---|---|
| 18:30 | First `BAR` shift at the counter | Opens the night's **bar session**. Till lights up on their phone and on the laptop. |
| 18:45 | Customer with an unpaid reservation goes to the door first | Door scans → amber *UNPAID: pay at the bar*. Sends them to the counter. |
| 18:46 | Counter | Scans the same QR on the Tickets tab → ticket line for the amount owed; adds two drinks on the Bar tab; types the total into SumUp; taps **Card**. The reservation becomes paid through the existing state machine, the bar lines and stock movements are written. |
| 18:47 | Door | Rescans → green *PAID*. Records admission. Payment and admission stay separate states: paying at the counter before the 19:15 release stops the release; admission is the door's record. |
| 18:55 | Walk-up, no reservation | Counter: Tickets tab → Walk-up → 2 × standard → basket → SumUp → Card. Existing walk-up sale function; shadow account as now. |
| 19:02 | Someone paying **in advance** for Saturday's show | Same Tickets tab, same scan. The ticket line carries Saturday's performance; the transaction is stamped *tonight*. Tonight's reconciliation includes it (the money is in tonight's SumUp Z); Saturday's performance report shows the booking as paid. Nothing is tallied twice or in the wrong place (§4.5). |
| 19:05 | Customer wants to swap a concession for a standard and pay | *Edit on desk* → the desk changes the booking → the till takes what is now owed. |
| 19:10 | Someone who looks under 25 asks for a cider | Counter checks ID: one tap on **accepted**, or a refusal entry. Same phone, one tap from the till. |
| 19:30 | Interval | Bar tab only. Tickets tab is still there but nobody needs it. |
| 22:30 | Last `BAR` shift | **Close the bar**: SumUp Z-total typed in, checklist, closing note. Reconciliation is per *day* because the SumUp Z is per day (§4.5). |
| Next morning | DM / auto-close | The performance report(s) carry the bar section. |

The box office admin page (`/admin/boxoffice`) stays for desk work: reservation list, the 19:15
release, edits, comps, pass sales, but its *take payment* action writes through the same
transaction function with a tender, so there is exactly one ledger of money taken in the building.

### 2.3 Inside the FOH app

One app, shift-scoped tiles. The `/foh` home renders what tonight's confirmed shift (or role)
entitles you to: `DOOR` sees the six buttons from the show night design; `BAR` sees **Till**,
**Challenge 25**, **Close the bar**, plus *Tonight at a glance*, *Emergency* and *Contacts*;
the duty manager and `BOX_OFFICE`+ see everything. Same home, same device, same login: no
seventh app for a volunteer to learn. Routes live under `/foh/bar/**`; management surfaces
(products, deliveries, stocktakes, reports) under `/admin/bar/**`.

### 2.4 Devices and attribution

The till is designed for a personal phone first and the counter laptop second. Every transaction
records the acting user from the session; on a shared laptop that is whoever logged in, so where
attribution matters (alcohol sales, refusals) staff should use their own phone. The rota records
who was on regardless. No PIN-switching or shared-device user picker in v1.

A **module inside Proscenium**, not a standalone app, for the reasons above: it is made almost
entirely of things Proscenium already owns: performances, the rota, reservations and their
payment state, the auth roles, the end-of-night report.

## 3. Domain model

All money in **integer pence** (matching the rest of Proscenium: see
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md)); all stock in **the product's own
basis**: millilitres for anything with a container size, whole items for everything else
([ADR-0035](./decisions/0035-stock-is-counted-in-real-units.md)). A 70 cl bottle of gin is
`container_ml = 700`, a single takes 25 of them, and 28 singles empty the bottle exactly. Nobody
converts anything by hand, and no ratio is rounded.

```
bar_categories       id · name · sort · colour NULL
bar_products         id · category_id FK · name · unit TEXT ('bottle'|'can'|'measure'|'glass'|'each')
                     container_ml INTEGER NULL                    -- 700 for a 70 cl bottle; NULL counts it in whole items
                     stock_only INTEGER                           -- held but never sold: no price, never on the till
                     par_qty INTEGER NULL · status ('ACTIVE'|'HIDDEN'|'RETIRED')
bar_recipe_items     id · product_id FK → bar_products · sort     -- what a sold product is made of (see §3.1)
                     component_product_id FK NULL → bar_products  -- a fixed ingredient, or
                     choice_category_id FK NULL → bar_categories  -- one from this category, picked at the till
                     qty INTEGER                                  -- in the ingredient's basis: 25 (ml), or 1 (item)
                     -- exactly one of component_product_id / choice_category_id. No rows = holds its own stock.
                     sort · age_restricted INTEGER (default 1 for alcohol)
                     timestamps
bar_prices           id · product_id FK · price_pence · effective_from DATE · created_by
                     -- current price = latest effective_from ≤ today; never updated in place

bar_discounts        id · name ('Committee', 'Cast & crew') · percent INTEGER (1–100)
                     status ('ACTIVE'|'RETIRED') · sort · timestamps
                     -- admin data; percentage, bar lines only

transactions         id · taken_at · taken_on DATE (Europe/London) · taken_by_user_id FK
                     bar_session_id FK NULL                         -- NULL if no session was open (desk, daytime)
                     source ('TILL'|'BOX_OFFICE_DESK'|'SELF_SERVE') -- which screen wrote it
                     tender ('CARD'|'COMP'|'TAB') · comp_reason TEXT NULL -- no cash, ever; TAB is credit
                     discount_id FK NULL · discount_percent INTEGER NULL · discount_pence INTEGER DEFAULT 0
                     -- snapshot of the discount applied to the BAR subtotal; ticket lines are never discounted
                     comp_approved_by_user_id FK NULL · comp_approved_at NULL   -- COMP only; see §4.1
                     total_pence                                    -- after discount; what was typed into SumUp
                     tab_debtor_user_id FK NULL                     -- TAB only: who owes (§4.6)
                     tab_settled_at NULL · tab_settlement_transaction_id FK NULL
                     -- stamped when the CARD settlement clears this charge
                     voided_at NULL · voided_by NULL · void_reason NULL
                     -- ONE row per SumUp tap (or comp, or tab charge). The thing you reconcile.
transaction_lines    id · transaction_id FK
                     kind ('TICKET_PAYMENT'|'WALK_UP'|'BAR_ITEM'|'PASS_SALE'|'TAB_SETTLEMENT')
                     amount_pence                                  -- signed total for the line
                     reservation_id FK NULL · performance_id FK NULL   -- ticket kinds
                     product_id FK NULL · qty INTEGER NULL · unit_price_pence NULL · price_id FK NULL  -- BAR_ITEM
                     choices JSON NULL                             -- what the till picked per choice slot (§3.1)
                     -- price snapshotted, same principle as ticket pricePaid
                     -- The bar ledger is simply WHERE kind = 'BAR_ITEM'. Line amounts are gross;
                     -- the discount is on the transaction, so product reports stay honest.
                     -- TAB_SETTLEMENT carries NO product: it is money for a sale already
                     -- recorded, which is what stops a tab counting twice.

comp_requests        id · requested_by FK · requested_at · bar_session_id FK · reason TEXT
                     lines JSON (the bar basket) · gross_pence
                     status ('PENDING'|'APPROVED'|'DECLINED'|'EXPIRED')
                     decided_by FK NULL · decided_at NULL · transaction_id FK NULL (set on approval)

stock_movements      id · product_id FK (always the *stock* product) · qty (signed, in the product's basis)
                     kind ('DELIVERY'|'SALE'|'COMP'|'STOCKTAKE'|'WASTAGE'|'TRANSFER'|'ADJUST'|'VOID')
                     ref_table · ref_id                            -- the sale line / delivery line / stocktake line
                     cost_pence_per_container NULL                 -- on deliveries
                     reason TEXT NULL · created_by · created_at
                     -- on_hand = SUM(qty) per product. Derived, never stored.

stock_deliveries     id · supplier TEXT · delivered_on DATE · invoice_ref NULL · total_pence NULL
                     received_by · notes · created_at
stock_delivery_lines id · delivery_id FK · product_id FK · qty · cost_pence_per_container

stocktakes           id · started_at · started_by · finished_at NULL · finished_by NULL
                     status ('OPEN'|'APPLIED'|'ABANDONED') · notes
stocktake_lines      id · stocktake_id FK · product_id FK
                     expected_qty (snapshot at start) · counted_qty NULL · reason TEXT NULL
                     -- on finish: one STOCKTAKE movement per line with variance ≠ 0

age_checks           id · performance_id FK NULL · checked_at · checked_by_user_id FK
                     outcome ('ACCEPTED'|'REFUSED')
                     -- ACCEPTED rows are the tally (no other fields)
                     reason ('NO_ID'|'ID_NOT_ACCEPTED'|'UNDER_25_NO_ID'|'INTOXICATED'|'PROXY'|'OTHER') NULL
                     product_id FK NULL · description TEXT NULL · notes TEXT NULL
                     supersedes_id FK NULL                        -- corrections reference the original
                     -- append-only: no UPDATE or DELETE path exists for this table

bar_sessions         id · night DATE · venue TEXT NULL · opened_at · opened_by
                     closed_at NULL · closed_by NULL · closing_note TEXT · checklist JSON
                     -- one per NIGHT, not per performance; the open/close/checklist wrapper.
                     -- bar_session_performances (session_id, performance_id) links the shows it served.
day_reconciliations  day DATE PK · sumup_z_pence · entered_by · entered_at · note
                     -- the Z-total lives here, keyed on the DAY, so a day with no bar session
                     -- (advance payments on the desk) can still be reconciled from admin.
```

### 3.1 Sellable vs stock products

A 175 ml glass of house white is sold; a 75 cl bottle is stocked. What a sold product is made of
is its **recipe**, a row per ingredient in `bar_recipe_items`
([ADR-0036](./decisions/0036-a-sold-product-is-a-recipe.md)). `House white, large glass` is one
ingredient: 175 of the bottle's millilitres. **No rows means the product holds its own stock**, so
a bottled beer needs no figure at all and a sale takes one whole container of itself.

An ingredient is either **one product** or **a choice from one category**, filled at the till. That
covers the three things the bar actually pours:

| Sold as | Recipe |
| --- | --- |
| Gin, single | 25 ml of the gin bottle |
| Gin and mixer | 25 ml of the gin bottle, **plus one from Mixers** |
| Espresso martini | 50 ml vodka, 25 ml coffee liqueur, 25 ml espresso |

A bottle of spirits is `stock_only`: it is delivered, counted and poured from, but it is never
sold whole, so it carries no price and the till never offers it.

Two rules hold this together. **One level:** an ingredient must itself hold stock, so a recipe of
recipes is refused. And **the price is on the sold product, not on what is picked**, so a choice
pool should be things you charge the same for. Per-choice surcharges are deliberately not built.

Every sale line still produces `SALE` movements against **stock** products only, merged per
product across the basket, one statement each (ADR-0006).

### 3.2 Invariants

- `on_hand` is always `SUM(stock_movements.qty)`; nothing writes it directly.
- **A product's container size is fixed once anything has moved against it.** Every movement is
  recorded in the size that was current when it was written, so changing it later would re-base
  the history silently. The API refuses the change and says to retire the product instead
  ([ADR-0035](./decisions/0035-stock-is-counted-in-real-units.md)).
- A transaction is immutable once recorded. Mistakes are **voided** (reversing the movements and,
  for ticket lines, the payment) and re-rung. The reversal does exist:
  `POST /api/reservations/:id/refund`, which is manager-gated. So a void touching ticket lines
  needs the refund permission, and a bar-shift user who tries one is refused and sent to the desk;
  a bar-only void needs no such permission inside the window in §5.
- A transaction always records `taken_by_user_id` from the session: there is no anonymous till.
- **Ticket lines never carry ticketing logic.** `TICKET_PAYMENT` and `WALK_UP` lines are produced
  by the box office's own code, which this module calls; it records only that the money was taken
  here, how, and alongside what. Two facts from the August 2026 audit govern *how* it calls it, and
  neither was known when this section was first drafted. **There is no payment function and no
  tender to add one to**: collection is the payment boundary and it is a bare status transition
  ([ADR-0011](./decisions/0011-collection-is-the-payment-boundary.md)), so the money event has to
  be introduced, not extended. And **D1 has no interactive transactions**: Drizzle over D1 offers
  `db.batch()` and nothing else, so "inside the same transaction" cannot mean passing a handle
  down. The box office code is therefore refactored into *statement builders* that return batch
  items, and one `db.batch()` writes the transaction, its lines, the stock movements and the
  collection transition together or not at all. Both points are
  [ADR-0023](./decisions/0023-money-taken-is-recorded-as-a-transaction.md), and they are the
  prerequisite stage in §7.
- `age_checks` is append-only, enforced by a SQLite trigger rather than by convention, and
  corrections are new rows carrying `supersedes_id`
  ([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)).
- At most one open `bar_session` per night per venue. A bar opened outside a performance (a
  social, a get-out) is a session with no linked performances.
- **A tab may never carry a ticket line.** `TICKET_PAYMENT` and `WALK_UP` flip a reservation to
  `COLLECTED`, which is the payment boundary (ADR-0011), so ticket money on credit would mark a
  booking paid for money nobody took. `buildTransaction()` refuses it, not just the route
  ([ADR-0030](./decisions/0030-a-tab-is-a-sale-on-credit.md)).
- **The tab charge is the only voidable transaction**, and only while unsettled. Its stock is
  reversed by an opposing `VOID` movement *copied* from the original `SALE` rows, never recomputed
  from the catalogue ([ADR-0031](./decisions/0031-a-tab-charge-is-the-only-voidable-transaction.md)).

## 4. Screens

### 4.1 The till

Two tabs above one basket.

**Tickets tab.** A scan button (same scanner as `/foh`), a ref field and a name search. A found
reservation shows party, performance (highlighted if it is not tonight's), what's owed and its
state, with one action (**Add to basket** (the amount owed)) and a quiet *Edit on desk* link.
Already-paid reservations say so and offer nothing: the door handles admission.
Below, **Walk-up**: performance (tonight's, pre-selected if only one), ticket type, quantity,
optional name/email for the shadow account, **Add to basket**. Both actions use the box office's
existing functions.

**Bar tab.** Category chips, a grid of large product tiles (name, current price, a *"4 left"*
amber flag when on-hand < par). Tap to add.

**The basket** lists ticket lines (purple, with the ref) and bar lines together, then the gold
**Type into SumUp** figure with a sub-label: *Bar only / Tickets only / Bar + tickets in one
transaction*, and beneath it the **Discount** chips (§4.1.1). Two tender buttons: **Card**, and
**Comp** (§4.1.2). There is no cash button because there is no cash. The tap writes one `transactions` row and its lines atomically: the
reservation pay transition, the walk-up sale, the bar lines and the stock movements either all
happen or none do. Voided transactions are reversed, never edited.

#### 4.1.1 Discounts

A row of chips under the basket (*None · Committee 20% · Cast & crew 10%*) from the
admin-maintained `bar_discounts` list. Rules:

- **Percentage only, bar lines only.** The discount applies to the bar subtotal; ticket lines are
  never discounted (ticket prices are the box office's business and have their own override
  chain). In a mixed basket the basket shows *Bar £10.50 − 20% = £8.40 · Tickets £16.00 · Type
  into SumUp £24.40*.
- One discount per transaction. Rounding: compute the discount in pence on the subtotal,
  round half up, once.
- **Snapshotted** onto the transaction (`discount_id`, `discount_percent`, `discount_pence`) so
  changing the committee rate next year does not rewrite history. Line amounts stay gross, so
  "how much Neck Oil did we sell" is unaffected and "how much did we give away in committee
  discount" is one sum.
- Who may apply one is a matter of trust and training, not code, in v1: anyone working the till
  can pick a chip, and every use is attributed. Reports show discounts by staff member; a pattern
  is a conversation, not a feature.

#### 4.1.2 Comps: rare, and approved by the duty manager

Comping is the exception, so it is deliberately one step slower than a sale:

1. Staff build a bar-only basket (Comp is disabled if the basket has ticket lines: ticket comps
   are a ticket type on the desk), tap **Comp**, pick a reason (cast & crew, committee, spillage,
   other + note). This creates a `comp_requests` row, *not* a transaction. Stock does not move.
2. Tonight's **duty manager** sees *1 comp awaiting approval* on their FOH home and in Tonight at
   a glance, opens it, sees who is asking, what and why, and taps **Approve** or **Decline**. Same
   short-polling transport as the backstage messages. If the person at the till *is* the DM (or
   `BOX_OFFICE`+), the approval is inline: one extra confirm tap, still recorded as approved by
   them.
3. On approval the server writes the transaction (`tender = COMP`, `comp_approved_by`,
   `total_pence = 0`) and the stock movements. The requester's till shows *Approved by Quinn* and
   clears. Declined or unanswered after 10 minutes → the request expires and the staff member
   rings it up properly or lets it go.

The end-of-night report lists every comp with requester, approver and reason. If there is no
confirmed DM tonight, `BOX_OFFICE`+ may approve; if nobody can, there are no comps tonight,
which is the correct outcome.

If the acting user is not currently valid for the `bar` eligibility rule (§5) and the basket
contains an age-restricted product, the till shows a persistent amber banner on the tender row:
*"You're not recorded as trained to sell alcohol: ask the DM."* Soft gate in v1; see §8.

Works identically on a phone and the counter laptop. Tiles, prices and order are admin data.

### 4.2 Challenge 25

Two large counters at the top: **IDs checked & accepted** (one tap adds one) and **Refusals
logged** tonight. Below, the refusal form: reason chips, product asked for, description ("for the
register, not a name"), notes. Staff member, time, performance and the on-duty DM are filled from
context. The night's entries list below in reverse order.

Design rules: no names, no photos, append-only, corrections by new entry
([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)).

**The export is CSV first, PDF later.** Workers has no PDF renderer and adding one for a register
printed a few times a year is not a good trade, so the built export is CSV with a column layout that
matches the paper book. The across-the-counter artefact an inspection wants should be a
print-stylesheet page rendered by the browser, which lands with the reports work rather than here.
Admin export produces
one PDF per performance or date range laid out like the paper register: that export is what
goes across the counter at an inspection. Until the data-protection policy lands, retention
defaults to whatever the FOH incident log adopts.

The ID-check tally is optional in use but strongly encouraged in training (ADMN-102): a high
accepted-to-refused ratio is the evidence that Challenge 25 is operated, not just displayed.

### 4.3 Stock (bar manager, `/admin/bar/stock`)

Table per category: product, unit, on hand, par, last cost, sell price, GP %, status pill
(OK / Below par / Out), sold last 7 days. Actions: **Record delivery** (supplier, date, invoice
ref, lines with qty and cost), **Start stocktake**, **Add product**. Cost is the most recent
delivery cost; GP is displayed, not enforced.

KPIs above the table: stock at cost, lines below par, last delivery, GP this term. *Stock at cost*
at the end of each term is the closing-stock figure the Treasurer needs.

### 4.4 Stocktake

Starting a take snapshots `expected_qty` for every active stock product. Counting is the same
table, one line at a time on a phone in the store cupboard, **in containers**: a part bottle is a
decimal, and the app converts it to millilitres. Each line with a variance takes an optional
reason (breakage, pour variance, miscounted, wastage, unexplained). **Finish & apply** writes one
`STOCKTAKE` movement per varying line and the take becomes the new baseline. The footer shows net variance at cost and as a percentage of sales since
the last take. A variance report over time (per take, per product) lives in reports.

### 4.5 Close the bar / end of night

The reconciliation card is the point of the whole module. It is **per calendar day**, because
the SumUp Z-total is per day, and because every card payment in the building is now a
`transactions` row stamped with the day it was taken:

```
Card: bar items                             £281.80   (BAR_ITEM lines, taken today)
Card: tickets & walk-ups at the till         £96.00   (TICKET_PAYMENT + WALK_UP lines, source TILL)
   of which for other performances            £24.00   (advance payments: informational)
Card: taken on the box office desk          £412.00   (source BOX_OFFICE_DESK)
Tabs settled today                            £18.40   (TAB_SETTLEMENT lines; the money is in the Z)
SumUp Z-total should read                    £808.20
SumUp actual                                 [______]  → Matches / £x over / £x short

Discounts given (already off the Z)           £9.60   (Committee 20% × 6 · Cast & crew 10% × 2)
Comps (not in the Z)                          £14.00   (4 items · cast & crew · all DM-approved)
Put on tabs today (not in the Z)              £6.20   (settled on some later day; §4.6)
```

The identity to hold in your head, and the one to check when a day will not balance:

```
expected Z = card bar + card tickets + tabs settled − discounts − refunds
```

**Two questions, two lenses.** *"Does today's SumUp match?"* is answered by `taken_on = today`,
regardless of which performance any ticket was for. *"How did Saturday's show do?"* is answered
by `transaction_lines.performance_id = Saturday`, regardless of when the money was taken. An
advance payment on a Tuesday is in Tuesday's reconciliation and Saturday's performance report,
and in neither of the other two. A day with no bar session (a desk payment on a quiet afternoon)
is reconciled from `/admin/bar/reconcile/<day>` rather than from Close the bar; the expected
figure is computed the same way.

Then a short checklist (reconciled, refusals reviewed with the DM, low stock flagged, closing
note) and **Close the bar**. Closing writes the `bar_session` and contributes a
*Bar* section to each linked performance's end-of-night report (12-access-and-staffing §4.3):
takings by tender, comps, ID checks accepted/refused, stock warnings, closing note. Where two
performances shared a bar, the section is the night's bar figures, labelled as such: we do not
pretend to split a pint between the studio and the auditorium. Ticket money in the report is by
`performance_id`, so it *is* per show. If the bar is not closed by the
noon auto-close, the report carries the same "no sign-off" banner.

### 4.6 Tabs

The bar is sometimes open with nothing on: members or committee studying in the foyer want a
snack, and the reader is not to hand. That was a paper book, committee-only, reconciled at the end
of term. A tab is that book, in the same ledger as everything else
([ADR-0030](./decisions/0030-a-tab-is-a-sale-on-credit.md)).

**Two ways onto a tab.**

- **`/bar/tab`, your own phone.** Balance at the top, tiles below, one gold *Put £x on my tab*
  button. Nobody else is involved, which is the whole point: the case this serves is one person in
  an empty foyer. Alcohol is not on this screen at all, and the server refuses it even if asked
  directly, because there is no trained server and no Challenge 25 check.
- **The counter till, *Tab* beside *Card* and *Comp*.** Pick the person from a list of everyone
  who may run a tab, read from stage-door and searchable by name, with what each already owes
  beside them. When stage-door cannot answer, the panel falls back to an exact-email lookup and
  the server stops checking the debtor's permission, because a bar that cannot sell is the worse
  outage. Then see what they owe and add the basket. Age-restricted items are fine here: the training gate and the
  refusals register apply exactly as they do to a card sale. Disabled when the basket holds ticket
  lines, for the reason in §3.2.

**Settling.** Whoever has the reader takes the whole balance and taps settle, at the till or from
`/admin/bar/tabs`. That writes one `CARD` transaction with a single `TAB_SETTLEMENT` line, so the
money lands in that day's Z. It clears the balance *as at that moment* rather than a chosen list of
charges: a list of ids is the shape ADR-0006 forbids, and a predicate makes two people settling at
once a no-op rather than a race. A charge someone disputes is voided, not deselected.

*That moment* is the rowid the balance was read at, not the clock. `taken_at` is stored to whole
seconds, so a charge the debtor puts on their own phone while staff are settling at the counter can
read as on or before the settle's own timestamp; stamped settled, it would drop off the tab against
a settlement whose amount never included it, and the theatre would simply never take that money.

**The limit is soft.** Over `TAB_SOFT_CAP_PENCE` the screen asks them to settle up and the admin
page flags them, and the charge still goes through. A blocked charge does not stop somebody taking
a packet of crisps; it stops the crisps being recorded.

**What this does to the books.** A tab charged in one term and settled in the next is in the first
term's sales and the second term's SumUp totals. That is what selling on credit is. The reconciling
figure is the outstanding balance on `/admin/bar/tabs`, and the Treasurer wants it at both ends of
a term.

## 5. Roles, scoping and training

- **`BAR` shift confirmed on tonight's rota** (12-access-and-staffing §3) lights up the Till,
  Challenge 25 and Close the bar for tonight, exactly as a `DOOR` shift scopes the door screens.
  The underlying role is the existing `FRONT_OF_HOUSE`; the rota supplies the scope.
  `BOX_OFFICE`+ bypasses the rota as everywhere else. A `DOOR` shift does **not** see the till:
  the door never sells.
- **`bar.tab`**, a new permission carried by a new **`COMMITTEE`** role, and by `MANAGER` and
  `ADMIN`. It is the only thing that role carries: no `staff.access` and no `foh.work`, so a tab is
  not a way into anything else, which is why `/bar/tab` sits outside `/foh` with its own middleware.
  The rota cannot scope it, because the case it serves has no performance and therefore no shift.
- **Bar manager**: a new permission **`bar.manage`**, declared in `shared/utils/appManifest.ts`
  and carried by a role granted to whoever runs the bar that year: products, prices, deliveries,
  stocktakes, voids, exports, the Challenge 25 register export. `MANAGER` and `ADMIN` carry it too.
  Permission keys here are dotted and role-mapped in the manifest; this app has no ad-hoc ability
  strings.
- Every write records the acting user. There is no separate audit log: a void carries who did it
  and why on the transaction, and a price change is a new dated row rather than an edit, so the
  price history is the record. Neither can be rewritten in place. This module adds
  more user-referencing columns than the rest of the app put together, and every one of them joins
  the estate merge and erasure hooks on the commit that creates it
  ([ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md)).

**Training.** The rota defers claimability to `rehearsal`'s eligibility rules
(12-access-and-staffing §3.3,
[ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)), so the bar
adds **rules, which are data in rehearsal's admin UI**, not code in this repo. Keys to be ratified
with the module catalogue:

| Rule key | Requires (all currently valid) | Gates |
|---|---|---|
| `door` | NNT-001, ADMN-103 *Box Office & Ticketing* | Claiming a `DOOR` shift |
| `bar` | ADMN-102 *Selling Alcohol* (itself requiring ADMN-101), ADMN-103 | Claiming a `BAR` shift; the soft gate on age-restricted tiles (§4.1) |
| `duty-manager` | as already proposed (NNT-001, ADMN-101, SFTY-002) | Claiming `DUTY_MANAGER` |

**Practice.** Learning the till on a real show night, with a customer waiting, is how it is done
today and is not good enough. [14-training-mode](./14-training-mode-design.md) adds a sandbox on the
till and on Challenge 25, reachable only while rehearsal says the person is being taught it, writing
to nothing operational at all
([ADR-0032](./decisions/0032-training-mode-writes-to-its-own-table.md)). It is a separate programme
that sits on top of this one and cannot start before it.

`bar` includes ADMN-103 because the counter till takes ticket money. ADMN-102's description
should name this system explicitly: the refusals log, the ID-check tally and closing the bar are
now things you do in the app, and the module is where people learn them. ADMN-103 gains "the
counter till: tickets and bar in one basket". Training is annual (AY) for both, so the rota's
claim filter quietly enforces the refresh each October.

## 6. Reports and exports (`/admin/bar/reports`)

Sales by product / category / performance / month; tender split; discounts by type and by staff member; comps by reason with requester and approver; GP by product;
stocktake variance over time; Challenge 25 register (PDF); everything as CSV. Date-range pickers
default to the current term. The Treasurer's monthly ask is: sales by month by tender, closing
stock at cost: make those two one click.

## 7. Build order

Each stage is independently shippable and useful on its own.

0. **The payment record**, as its own pull request and before any bar UI.
   `transactions`/`transaction_lines`; the box office's collection and walk-up code refactored
   into statement builders; the desk's collect action writing a transaction; parity tests proving
   a desk payment and a till payment leave identical reservation state. No bar screens at all.
   This is the change that kills "SumUp minus tickets", it is the riskiest thing in the module,
   and keeping it separate is what makes it reviewable
   ([ADR-0023](./decisions/0023-money-taken-is-recorded-as-a-transaction.md)).
1. **The till, both tabs.** Categories, products, date-effective prices and discounts; the till
   with Tickets and Bar tabs over one basket; `bar_sessions` per night; the per-day
   reconciliation.
2. **Challenge 25.** Append-only `age_checks`, the tally, the form, the register export. Zero
   dependencies on stage 1 beyond the FOH shell; could ship first if the bar manager wants the
   paper book gone before Freshers'.
3. **Stock.** Movements ledger, deliveries, par flags on tiles, stocktakes, variance, the stock
   and reports pages.
4. **Shift-scoped FOH home + training gates.** Tiles by shift; `door`/`bar` eligibility rules
   consumed by the rota claim filter and the till's soft gate. (Needs the training API; until
   then the soft gate reads a hand-maintained flag behind the same function.)
5a. **Tabs.** `tender = 'TAB'`, the self-service screen, the till's tab tender, settlement and
   the admin page. Independently shippable, and the self-service half alone replaces the paper
   book for the daytime case (ADR-0030, ADR-0031).
5. **End-of-night integration.** The *Bar* section in the performance report(s); auto-close
   behaviour. (Lands whenever 12-access-and-staffing §4 exists; until then the close screen
   emails its own summary to `boxoffice@`.)

## 8. Open questions

- **Who holds `bar.manage`** this year: FOH manager, Theatre Manager, or a named bar manager?
  Committee decision; the system only needs a name.
- **Retention for `age_checks`**: adopt with the data-protection policy (spring 2027). Until
  then: keep.
- **Discount list and rates** (mockup: Committee 20%, Cast & crew 10%), committee sets them; admin data.
- **The tab limit** is a constant, `TAB_SOFT_CAP_PENCE` in `server/utils/barTabs.ts`, currently
  £20. Committee decision whether that is the right figure and whether it should ever become a
  hard block. Default: leave it soft.
- **Hard or soft training gate on alcohol sales.** v1 warns. Making it a hard block (tile
  disabled for an untrained user) is a committee/licensing decision; it is a one-line change.
  Note that [ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md) asks
  to be revisited in the same commit if this becomes hard: a licensing control that fails open is
  not one, and the eligibility seam currently fails open.
Formerly open, now settled: **bundles and deals** are recipes, the same mechanism a gin and tonic
uses (ADR-0036), so a "Deals" category needs no new table; **measure sizes** are configured per
product as real millilitres
(ADR-0035), so 25 or 35 for a spirit and 125/175/250 for wine is a catalogue entry rather than a
schema question; **voiding a mixed transaction**, the box office reversal exists
(`POST /api/reservations/:id/refund`, manager-gated), so a void touching ticket lines needs that
permission and everyone else is sent to the desk (§3.2); SumUp stays the payment device and is not
integrated via API ([ADR-0024](./decisions/0024-sumup-stays-a-manual-reader.md)); this is
a Proscenium module not a standalone app; the till is the single counter till for tickets and
bar with one basket (no split transactions); the till takes money and the desk changes bookings;
the door never sees it; there is no cash; discounts are percentage-only and bar-only, snapshotted per transaction; comps require duty-manager approval before anything is recorded; reconciliation is per calendar day over every
transaction taken that day, and advance payments belong to the day taken;
stock is a full ledger (deliveries + stocktakes + variance) rather than count-in/count-out; the
Challenge 25 log records accepted ID checks as well as refusals.
