# Module F: Bar

The bar till keeps the old estate's strongest invariants (one figure for money, append-only stock,
recipes over stocked ingredients) and rebuilds them around first-class serving-size variants, which
supersede the damaged container model. All money is taken in person on the SumUp reader: the till
computes, cross-checks and records; it never initiates an online charge and never touches card
data. Every sale, tab charge, comp and settlement posts to the unified ledger in integer pence, and
on-hand stock is always the sum of movements, never a stored figure.

Counts: 33 stories (28 MVP, 3 V2, 1 Later, 1 resolved won't-build).

Open questions:

- Answered 26 August: SP-1 was refused access to the SumUp developer toolkit. F-201 is resolved
  as won't-build and the typed cross-check is the permanent till flow. Amended 14 September: the
  toolkit refusal covers the reader API and SDK; SumUp's Payment Switch is the SumUp app itself
  on the volunteer's phone, configured from the merchant dashboard, and F-124 builds on it
  (decision 0069). The typed cross-check stays as the laptop's flow and the fallback.
- Who qualifies as an authorised tab holder in the unified system (committee only, as today, or a
  treasurer-approved list), and what is the default hard cap? The old estate's £20 was a soft nag.
  Answered 24 September 2026 by the IT Manager (issue 1264): people and roles. A holder is anybody
  named in `BAR_AUTHORISED_TAB_HOLDERS`, or anybody holding a live grant of a role named in
  `BAR_AUTHORISED_TAB_ROLES`. A role grant lapses at the committee year end (0009), so credit by
  role lapses with it and is checked at the next charge. Naming a role widens who is extended
  credit to everybody who holds it, now and later in the year, which the settings screen says.
  The roles are a second key rather than a reshaped first one, because a key holds a list of
  scalars and never records (0025), and because role names are not personal data: the roles key
  is audited with its values while the people key stays hashed (0024). Both start empty. The
  default hard cap is `BAR_TAB_CAP_PENCE`'s proposed value until the workshop confirms it.
- Answered 15 September 2026: the imported stock-movement history is informational and never the
  balance, the most recent applied stocktake is, and no documented data-damage repair runs as a
  repair: damage is written off explicitly by a dated movement. A production export found nothing
  to carry in any case (K-116). Decision 0080.
- Answered 15 September 2026: wastage reasons are a fixed vocabulary in code
  (`MOVEMENT_REASONS`), not a managed list, with optional free-text detail on the movement that
  reports never group by and that holds no personal data. Decision 0079; story F-204.
- Answered 15 September 2026: on a night with no performance (an external hire with the bar open),
  a bar opening is planned like a rota and a confirmed shift on it opens the till; the bar
  manager's officer role still opens it by naming the venue, recorded as any bypass is. Comp
  approval widens the same way. Decision 0077; stories F-125 and E-130.

## F-101: Till access scoped to tonight's bar shift

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want the till to open only while I hold a confirmed bar shift
  tonight so that till authority derives from the rota and evaporates on its own.
- Depends on: E-1 (rota and shift-scoped authority)
- Acceptance criteria:
  1. The till opens only to a person holding a confirmed bar shift for a performance tonight
     (the show night runs 04:00 to 04:00 Europe/London), or to the bar manager's officer role.
  2. A confirmed door or duty-manager shift does not open the till; the roles are not
     interchangeable.
  3. Authority is checked at the write path on every request, so a released shift stops opening the
     till immediately, with no cached grant surviving the release.
  4. After the 04:00 boundary the shift no longer opens the till, even with a live login session.
  5. A refusal names exactly what would unlock access (a confirmed bar shift tonight, or the bar
     manager role), so a volunteer knows what to fix.
- Source: Prompt Book F-1, P3; audit PR-12.

## F-102: One open till session per venue per night

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want to open one till session for my venue and night so that
  every sale hangs off a single accountable session.
- Depends on: F-101
- Acceptance criteria:
  1. Opening a session records venue, the London date of the show night, the opener and the opening
     time; a database constraint holds at most one open session per venue per night.
  2. Two racing opens resolve to exactly one session: the loser is joined to the existing session
     rather than creating a duplicate.
  3. Sales, tab charges and comps can only be recorded against an open session; with no open
     session the sale screen refuses with a prompt to open one.
  4. Closing a session stamps the closer and closing time, refuses further sales, and presents the
     session's expected reconciliation figure (F-118).
  5. An unclosed session from a previous night surfaces on the duty manager's close-night checklist
     and remains closable by the bar manager later, dated to its own night.
- Source: Prompt Book F-1; audit PR-12 (partial unique index per venue per night).

## F-103: Basket with serving-size variant buttons

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want to build a basket by tapping products and size variants so
  that serving one customer at the interval takes seconds.
- Depends on: F-101, F-102, F-111, F-112, F-116
- Acceptance criteria:
  1. The sale screen shows one tile per product; a product with multiple variants expands to size
     buttons (Bottle, 125ml, 175ml, 250ml; Single, Double), and a single-variant product adds to
     the basket in one tap.
     Amended by decision 0083: the size buttons open in a sheet from the tile, not inside it.
  2. A variant with a choice group (a spirit's mixer) prompts for the choice before the line lands
     in the basket; the basket line names product, variant and chosen option.
  3. Each line prices from the variant's effective price (F-116) in integer pence; the running
     total is the sum of the lines, computed server-side on submission.
  4. Quantities are editable and lines removable before payment; an empty basket cannot be
     submitted.
  5. The screen is phone-first and one-handed per K-1: adding any variant never requires a text
     field, and touch targets meet the show-night size standard.
  6. The category row above the grid filters it rather than scrolling to a heading: **All** and
     one chip per category with something to sell; the chosen chip reads as pressed, a chosen
     category shows its tiles alone, and the choice stays from one sale to the next until another
     chip is pressed. A chosen category that empties falls back to All rather than to a blank grid.
- Source: Prompt Book F-2, Get-In constraint 5; audit PR-12.

## F-104: Expected-total cross-check on every sale

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want the till to refuse any sale whose stated total disagrees
  with its own arithmetic so that the amount keyed into the reader always matches the record.
- Depends on: F-103
- Acceptance criteria:
  1. Every sale submission carries the expected total in pence as computed on-screen; the server
     independently recomputes it from lines, variants, effective prices and applied discounts.
  2. A mismatch is a refusal quoting both figures; nothing is written to the ledger or the stock
     movements on a refusal.
  3. After a refusal, the corrected resubmission runs the full cross-check again; there is no
     bypass or "accept anyway" path.
  4. Tender is card or comp only; the theatre takes no cash and the till offers no cash tender.
  5. The typed cross-check is the permanent flow: SP-1 was refused SumUp developer access, so no
     reader integration exists to fall back from (F-201 resolved as won't-build).
  6. The figure to key into the reader is the one number the confirmation is read for: it is shown
     at display size in the mono face, with tabular figures, and the words around it stay short
     enough to read across a bar. Nothing else on the confirmation competes with it.
- Source: Prompt Book F-1, D-3, Get-In constraint 1; audit PR-5, PR-12; issue 1150 item 6.

## F-105: Atomic sale write

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want a completed sale to write its payment, its lines and its
  stock movements in one transaction so that money, sales and stock can never disagree.
- Depends on: F-103, F-104, F-113, F-114, I-1 (unified ledger)
- Acceptance criteria:
  1. One transaction writes: a ledger entry in integer pence (source bar, actor, session
     reference), one sale line per basket line with price and any discount snapshotted, and one
     stock movement per resolved recipe ingredient, depleting the variant's quantity multiplied by
     the line quantity.
  2. Any failure writes nothing: a partial sale (payment without movements, or movements without
     payment) is impossible, and a test injecting failure mid-write proves it.
  3. Every stock movement references the sale line that caused it, so a void can credit exactly
     what was depleted and nothing else.
  4. The sale is attributed to the seller and the open session; times are stored in UTC and always
     presented in Europe/London.
  5. Two concurrent sales are both correct under simultaneous writes: on-hand is derived from the
     movement sum, never read-then-written.
- Source: Prompt Book F-1, P2, P4; audit PR-12.

## F-106: Challenge 25 inline at the point of sale

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want age-restricted items to prompt the Challenge 25 flow inside
  the sale so that the licensing record is made at the moment it happens, not remembered later.
- Depends on: F-103, E-3 (age-check register)
- Acceptance criteria:
  1. Products carry an age-restricted flag; a basket containing any restricted line requires a
     Challenge 25 outcome (not required, checked and passed, or refused) before payment can
     proceed.
  2. The prompt is inline in the sale flow, two taps for the routine pass case; the basket is
     preserved throughout.
  3. A refusal writes to the append-only Challenge 25 register with a mandatory reason and a
     physical description, never a name; the restricted lines are then removed and the remainder of
     the basket may still be sold.
  4. Register entries are append-only with corrections superseding, and export for licensing
     inspection through module E.
  5. Every sale path (card, comp, tab) runs the same prompt: no route sells a restricted item
     without the flow.
  6. The prompt comes before the drink is poured, not at the charge: a restricted product carries a
     visible mark on its tile, carried by text and not by colour alone, and the first restricted
     line to enter a basket opens the prompt naming that product. A basket whose check has already
     been accepted does not ask again in the same sale. A refusal at the tap takes the restricted
     lines back out of the basket, says on screen what is not being sold, and is written to the
     register there and then, since the sale that would otherwise carry it may never happen.
  7. The prompt's first answer is **Visibly over 25**, the ordinary case under the policy: no ID
     was asked for, so it settles the sale the way an accepted check does, and the register entry
     it writes carries that outcome with no ID type and no reason (E-118 criterion 1, decision
     0085). The register, the night report and the licensing export count it as its own outcome.
- Source: Prompt Book F-1, E-3; audit PR-9, PR-12; issue 1150 item 5.

## F-107: Allergen notes one tap from every product

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want allergen information one tap from every product so that a
  customer's question is answered at the till, not with a shrug.
- Depends on: F-103, F-111
- Acceptance criteria:
  1. Every product carries an allergen note maintained in product administration; the sale screen
     shows an allergen affordance on every product tile and basket line.
  2. Opening the note never leaves the sale; the basket is intact on return.
  3. "Confirmed no allergens" is a distinct recorded state from "no information recorded", and the
     till displays which of the two it is.
  4. A recipe product's note covers its constituent ingredients, including every option in a choice
     group.
  5. Notes are readable by anyone the till opens for, with no extra permission.
- Source: Prompt Book F-1; audit PR-12 (no allergen surface existed in the old till).

## F-108: Tabs for authorised holders with a hard cap

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want to charge a sale to an authorised tab with a hard cap so
  that credit at the bar is bounded by rule, not by embarrassment.
- Depends on: F-103, F-105, A-2 (membership state)
- Acceptance criteria:
  1. Tab tender is offered only for authorised holders (the authorised set is configuration,
     settled in Phase 0); authorisation is checked at the write path on every charge. Amended 24
     September 2026 (issue 1264): the authorised set is the people named in
     `BAR_AUTHORISED_TAB_HOLDERS` together with everybody holding a live grant of a role named in
     `BAR_AUTHORISED_TAB_ROLES`. A lapsed or revoked grant stops the next charge, and a disabled
     or anonymised account is never a holder. The grants are matched by a subquery in the query
     that authorises the charge, never expanded to a list of ids (0006).
  2. Only bar lines may ride on a tab; ticket money can never be charged to one, structurally
     rather than procedurally.
  3. A configurable hard cap applies per holder; a charge that would take the outstanding balance
     past the cap is refused quoting the balance, the charge and the cap.
  4. The duty manager or bar manager may override a cap refusal; the override records the approver
     on the charge itself.
  5. A tab charge writes lines and stock movements atomically per F-105, with a ledger entry marked
     as credit extended, not money taken.
- Source: Prompt Book F-1; audit PR-12 (the old £20 cap was a nag, not a block).

## F-109: Tab settlement, itemisation, voids and year end

- Role: Tab holder
- Phase: MVP
- Story: As a tab holder, I want my tab itemised in my account and settled on the reader so that
  what I owe is transparent and paid the sanctioned way.
- Depends on: F-104, F-108, I-1 (unified ledger)
- Acceptance criteria:
  1. The holder's account shows every charge itemised (date, session, lines, amounts) and the live
     outstanding balance.
  2. Settlement is taken in person on the reader with the expected-total cross-check (F-104), and
     posts a ledger entry referencing exactly the charges it settles.
  3. Settlement is bounded at initiation: a charge landing mid-settlement stays outstanding rather
     than being silently absorbed into the total.
  4. Only an unsettled charge may be voided (bar manager, mandatory reason); a settled charge is
     corrected by refund policy, never by void.
  5. A void credits each of the charge's stock movements exactly once and is refused on repeat: the
     double-void that double-credited stock in the old estate is a named regression case.
  6. Unsettled tabs at year end appear on the treasurer's closing checklist with holder and
     balance, and the year cannot close with that list unreviewed.
- Source: Prompt Book F-1, P4; audit PR-12 (double-voided tab charges, settlement bounded by row).

## F-110: Comps by request and approval before the sale

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want comps to require a reasoned request and an approval before
  the sale so that giveaways carry a named sign-off and visible cost.
- Depends on: F-105, E-2 (duty manager shift authority)
- Acceptance criteria:
  1. A comp sale requires a prior request with a reason; approval belongs to tonight's confirmed
     duty manager or the bar manager, and a requester can never approve their own request.
  2. Approval is claimed atomically: two racing approvals resolve to a single decision, and only
     then may the sale proceed.
  3. Requests expire on a configurable timer (default 10 minutes); an expired request cannot
     authorise a sale.
  4. The comp sale writes a zero-value payment with full-price lines snapshotted, so foregone
     revenue is a visible figure, never a silent gap; stock depletes exactly as a paid sale would.
  5. Every approval and decline is audited with actor, reason and outcome, and comp totals feed the
     session reconciliation (F-118) and the period reports (F-119).
- Source: Prompt Book F-1, F-2, P4, P6; audit PR-10, PR-12.

## F-111: Product and category administration

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want to manage products and categories so that the till's menu
  reflects what the bar actually stocks tonight.
- Depends on: none
- Acceptance criteria:
  1. Products carry name, category, allergen note (with the "confirmed none" state), age-restricted
     flag and active flag; categories carry a display order that drives the till layout.
  2. A product cannot be made active until it has at least one variant (F-112) and a resolvable
     recipe (F-113).
  3. A product that has ever sold can be retired but never deleted, so historical lines keep their
     reference; retired products vanish from the till and remain in reports.
  4. Category and ordering changes appear on the till immediately, without a deploy.
  5. The surface is restricted to the bar manager and administrators, and every change is audited
     with a from/to diff.
  6. One way to create a product, not two side by side. A new product's age-restricted flag and a
     new stocked item's each start from one stated default, read by every screen that offers
     either rather than spelled again per screen. A picker over the stock register reaches the
     whole register, by searching it where it is longer than one page (K-123).
- Source: Prompt Book F-2; audit PR-12, PR-7 (archive-not-delete judgment); criterion 6 from
  issue 1151 item 10, 21 September 2026.

## F-112: Serving-size variant administration

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want serving sizes as first-class variants so that one stocked wine
  sells by the bottle or by the glass and the stock ledger stays truthful.
- Depends on: F-111, F-114
- Acceptance criteria:
  1. A variant belongs to one product and carries its own display name, its own dated price series
     (F-116) and its own depletion quantity, so wine sells as Bottle, 125ml, 175ml or 250ml against
     one stocked bottle item, and a spirit as Single or Double.
  2. Depletion quantities are stated in the stocked item's real units, validated positive, and
     independent of price: a Double may deplete twice a Single without costing twice as much.
  3. A variant may attach a choice group (a mixer): the chosen option depletes its own stocked item
     at the option's stated quantity, in addition to the variant's own depletion.
  4. No container size is ever stored on the product itself; sizes live only on variants, which
     retires the old estate's damaged container semantics by construction.
  5. A variant that has sold cannot be deleted; retiring it hides it from the till without touching
     any historical line or movement.
- Source: Prompt Book F-2, Get-In constraint 5; audit PR-12 (container sizes clobbered by
  migration 0052).

## F-113: Recipes over stocked ingredients

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want products defined as recipes over stocked ingredients so that
  selling a drink depletes exactly what pouring it consumed.
- Depends on: F-111, F-114
- Acceptance criteria:
  1. A recipe lists stocked ingredients with quantities and is exactly one level deep: an
     ingredient is a stocked item, never another product, enforced at the write path.
  2. A recipe line may be a choice group (choose one of N options), each option a stocked item with
     its own quantity; the till requires the choice at sale (F-103).
  3. A sale writes one movement per resolved ingredient (F-105), including the chosen option.
  4. Editing a recipe affects future sales only; movements already written are never restated.
  5. A product cannot be active while its recipe references a retired stocked item, and the refusal
     names the offending ingredient.
- Source: Prompt Book F-2; audit PR-12.

## F-114: Append-only stock ledger

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want stock as an append-only ledger of movements so that on-hand is
  always a derived fact and variance is a number, not a suspicion.
- Depends on: none
- Acceptance criteria:
  1. Stocked items are administered with a name and a real counting unit (millilitres, units); the
     item register supports retirement but never deletion once movements exist.
  2. On-hand for any item at any moment is the sum of its movements; no table, endpoint or job
     stores or writes a balance.
  3. Movement types cover at least: delivery (positive, with unit cost in pence), sale depletion
     (F-105), wastage (negative, mandatory reason), transfer (paired movements between locations
     netting zero), stocktake adjustment (F-115) and void credit (F-109).
  4. Movements are append-only, trigger-enforced: no update or delete; a correction is a reversing
     movement referencing the original.
  5. Every movement stamps its actor (or system), timestamp and source document (delivery, sale
     line, stocktake), so any on-hand figure can be audited to its causes.
  6. Deliveries record cost, giving GP reporting (F-119) its cost basis.
- Source: Prompt Book F-2, P2; audit PR-12; Get-In part 5 (trigger-enforced append-only).

## F-115: Stocktakes with blank-versus-zero and atomic apply

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want stocktakes that distinguish "not counted" from "counted zero"
  and apply atomically so that a count can be trusted and a gap can be measured.
- Depends on: F-114
- Acceptance criteria:
  1. Opening a stocktake captures the expected on-hand per item at that moment, so later sales do
     not muddy the comparison.
  2. A blank count (item not counted) is a distinct state from an entered zero; blanks post no
     adjustment and are listed as uncounted in the result.
  3. Variance per counted item is counted minus expected, shown in units and at cost before
     anything is applied.
  4. Applying posts one adjustment movement per counted item whose count differs from expected, in
     a single transaction, all or none, and freezes the stocktake. A count that agrees with
     expected posts nothing: a movement of zero moves nothing and the database refuses it.
  5. A frozen stocktake is immutable; a mistake is corrected by a new stocktake or a reversing
     movement, never an edit.
  6. Named regression case: a blank count never writes a zero adjustment, the exact damage the old
     estate recorded.
- Source: Prompt Book F-2; audit PR-12 (stocktake blanks recorded as zero).

## F-116: Dated append-only prices with same-day correction

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want prices as dated append-only rows where the latest on or before
  today wins so that a mispriced product is fixed with a new row, today, not tomorrow.
- Depends on: F-112
- Acceptance criteria:
  1. Prices attach to variants as dated rows in integer pence; the effective price is the latest
     row dated on or before today, Europe/London.
  2. Price rows are never updated or deleted; every change, including a correction, is a new row.
  3. Multiple rows on the same date are permitted and the latest created wins, so a same-day
     mistake is correctable immediately; the old estate's one-row-per-day model made this
     impossible.
  4. Sales snapshot the effective price onto each line at sale time; a later correction never
     restates a past sale.
  5. Future-dated rows are permitted and take effect on their date; the full price history per
     variant is visible to the bar manager.
- Source: Prompt Book F-2; audit PR-12 (one row per product per day, latest wins).

## F-117: Discounts, percent-capped and snapshotted

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want discounts that are percentage-based, capped and snapshotted so
  that a members' night is cheap by policy, never free by accident.
- Depends on: F-103, F-104
- Acceptance criteria:
  1. Discounts are percentages with an admin-configured maximum cap; creating or editing one above
     the cap is refused.
  2. Discounts apply to bar lines only; no discount can touch ticket money or a tab settlement
     total.
  3. Applying a discount snapshots its name, percentage and computed amount in pence onto each
     affected line, so later edits to the discount never restate history.
  4. The server's expected-total recomputation (F-104) includes the applied discount, so the
     cross-check still holds on discounted sales.
  5. Discount creation and edits are bar-manager-only and audited; usage per period reports as
     foregone revenue (F-119).
- Source: Prompt Book F-2, P4; audit PR-12.

## F-118: Reconciliation to the expected SumUp Z figure

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want reconciliation to produce the exact figure the SumUp Z should
  read for the London day so that cashing up is a comparison, not a reconstruction.
- Depends on: F-102, F-105, F-109, F-110, F-117, I-1 (unified ledger)
- Acceptance criteria:
  1. For any show night (04:00 to 04:00 Europe/London), reconciliation computes the expected reader
     total from ledger entries: bar card sales plus tab settlements, presented alongside the desk's
     takings and summing to the whole-day expected Z.
  2. The breakdown shows card sales, comps (count and foregone value at full price), discounts
     given, refunds, tab charges (credit extended, no money moved) and tab settlements, each as its
     own figure.
  3. Closing the till session presents the expected figure and records the actual Z read from the
     reader; any variance is stored with the session close and a note, append-only.
  4. The night report (module E) carries the bar summary from the same computation, never a
     retyped figure.
  5. Nights containing a DST transition compute over the correct wall-clock day; both transition
     nights are named test cases.
- Source: Prompt Book F-1, K-1; audit PR-12 (Z-figure reconciliation splits).

## F-119: Sales, GP, variance, comp and discount reports with CSV export

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want period reports with CSV export so that the committee and the
  treasurer read the bar's performance from the ledger, not from a spreadsheet.
- Depends on: F-105, F-114, F-115, F-117
- Acceptance criteria:
  1. Reports run per period (night, week, year, custom range, on the London calendar): sales by
     product, variant and category; GP as revenue against the delivered cost of depleted stock;
     stocktake variance; comps; discounts.
  2. Every report exports as CSV; exports guard against formula injection and page rather than
     truncate silently.
  3. All money is integer pence in the API and formatted only at display; percentages are computed
     server-side.
  4. Reports are queries over the ledger and movement history, never stored aggregates, so a
     correcting entry is reflected immediately.
  5. Access is limited to the bar manager, the treasurer and administrators.
- Source: Prompt Book F-2, P4; audit PR-12, PR-7 (CSV injection guard).

## F-120: Par levels and the suggested order list

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want par levels per stocked item and a suggested order list so that
  ordering before a show week starts from evidence rather than a walk round the store.
- Depends on: F-114, F-115
- Acceptance criteria:
  1. Each stocked item may carry a par level in its real units; the level is editable by the bar
     manager and audited.
  2. The suggested order list compares live on-hand (the movement sum) to par and lists shortfalls
     with quantities, grouped by category.
  3. The list generates on demand and exports as CSV for sending to suppliers.
  4. Items without a par level are excluded from suggestions and listed separately as unconfigured,
     so a missing level is visible rather than silent.
  5. The list is advisory only: the system never places an order.
- Source: Prompt Book F-2, P6; audit PR-12 (no predecessor; par levels are new).

## F-121: Category default prices with included mixers

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want category-level default prices per serving kind so that pricing
  the whole bar is a handful of rows, not one per bottle.
- Depends on: F-112, F-116
- Acceptance criteria:
  1. A category carries optional default prices per serving kind (every soft drink £1; every
     spirit £2.50 as a single and £4.00 as a double); defaults are dated and append-only with the
     same same-day correction rules as variant prices (F-116).
  2. Resolution is variant price first, category default second: an explicit variant price always
     beats the default, and a variant with neither refuses to sell rather than guessing.
  3. A choice-group component can be marked included in a variant's price, so a double's price
     covers its soft-drink mixer; the mixer still depletes stock at zero charge and appears on
     the line.
  4. Every sale line snapshots the resolved price and which level supplied it (variant or
     category), so a later default change never restates a past sale and reports can separate
     the two.
  5. The catalogue screen shows each variant's effective price with its source, so a stray
     variant override hiding a category change is visible at a glance.
- Source: Decision 0017 (amended 26 August); Prompt Book F-1, F-2.

## F-122: Tickets on the till

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want to take a booking's ticket money in the same basket as the
  drinks so that a customer the door sent to the bar pays once, on one reader transaction, and
  walks back to a green scan.
- Depends on: F-103, F-104, F-105, D-108, D-114, E-129
- Context: The door never sells: unpaid and walk-up customers are sent to the bar
  (`/tonight/index.vue`). Until now the bar had nowhere to take that money, so the customer was
  sent on again to the desk. The old estate's bar design settled that the counter is the one
  money-taking point on a show night, with two tabs over one basket; this story is the tickets
  tab. The till takes money; the desk changes bookings.
- Acceptance criteria:
  1. The till has a Tickets tab beside the bar grid. It finds a booking by scanning its QR with
     the camera (the same `QrScanner` component and code forms as the door, E-129 criterion 2),
     by reference, or by name across tonight's performances at this venue.
  2. A found booking shows the party, the performance (flagged when it is not tonight's), its
     status and what is owed. A pending booking offers one action, adding what is owed to the
     basket; a collected, door, cancelled, expired or no-show booking says so and offers nothing.
     The till never edits a booking: swaps, refunds and comps stay on the desk.
  3. The basket lists ticket lines and bar lines together and the total is the one figure the
     reader takes. The sale posts one ledger entry, source `TILL` and tender `CARD`, carrying the
     bar lines as `BAR_ITEM` and each ticket as `TICKET_COLLECTION`, in the same batch as the
     booking's move to `COLLECTED` and the stock movements (F-105, D-114 criterion 6). Nothing is
     written on a refusal.
  4. The expected-total cross-check (F-104) covers the whole basket; a mismatch refuses quoting
     both figures. A discount applies to the bar subtotal only, never to a ticket line.
  5. A tab tender refuses a basket holding a ticket line: credit never marks a booking paid.
  6. Once collected at the bar the door reads PAID for that booking (D-108 criterion 5), and the
     ticket money appears in the till's reconciliation as tickets taken at the bar, inside the
     figure the reader is expected to show (F-118).
- Source: Old-estate bar design (13-bar-design, sections 2.1 and 4.1); committee mockup
  (Proscenium Bar, August 2026); Matt's direction, 13 September 2026.

## F-123: Walk-ups on the till

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff, I want to sell a walk-up ticket from the till so that somebody
  with no booking buys a seat and a drink in one go, without a second queue at the desk.
- Depends on: F-122, D-115
- Acceptance criteria:
  1. The Tickets tab sells a walk-up for one of tonight's performances at this venue: ticket type
     and quantity, priced from the performance's own bookable types, with the same per-line cap
     as the desk (D-115 criterion 3). Access ticket types are not sold here.
  2. A name and an email are asked for and encouraged, so the booker gets the confirmation with
     its QR (D-108); they are optional. A walk-up with neither is a reservation with no account
     behind it, findable by its reference and nothing else.
  3. The reservation is written with source `DOOR` and collected in the same request that takes
     the money (D-115 criterion 1); a walk-up line posts as `WALK_UP` on the till's ledger entry,
     source `TILL`. A basket abandoned before payment leaves no reservation behind.
  4. After the sale the screen shows a door pass for each walk-up: the reference in the mono face,
     the booking's QR and the party size, to photograph or to print from the counter laptop. The
     door scans or types it exactly as it does an emailed one.
  5. Capacity is enforced by the database as for every reservation (D-105); a performance with no
     room refuses the whole basket and nothing is charged.
- Source: Old-estate bar design (13-bar-design, section 4.1); D-115; Matt's direction, 13 and
  14 September 2026 (optional identity; the door pass).

## F-124: The phone hands the amount to SumUp

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff on my own phone, I want the till to open the SumUp app with the
  amount already keyed so that nobody types £45.00 for a £4.50 round, and the sale is recorded
  only once the reader has actually taken the money.
- Depends on: F-104, F-105, F-122, F-123
- Context: SP-1 was refused the SumUp developer toolkit, so the reader API and SDK stay out
  (0005). SumUp's Payment Switch is a different thing: an app-to-app link (`sumupmerchant://pay/1.0`)
  that opens the SumUp app already installed on the volunteer's phone, with an affiliate key
  generated from the merchant dashboard and no developer access. The app takes the payment on
  the SU's reader as it always has and returns to a URL of ours with the outcome. Decision 0069
  records why this is inside the SU's rule rather than around it.
- Acceptance criteria:
  1. With the affiliate key configured and on a handheld device, the charge action opens the SumUp
     app with the basket's total, a title, a unique foreign transaction id and a return URL of
     ours. Without the key, or on the counter laptop, the till behaves exactly as before: the
     figure is keyed into the reader by hand.
  2. Every hand-off is a `sumup_attempts` row holding the basket exactly as priced. Nothing posts
     to the ledger and no booking is collected until the SumUp app reports success, or until
     staff explicitly resolve the attempt as paid.
  3. The return URL carries a signed key for that attempt, so the outcome is accepted from a
     browser with no session (the SumUp app may return to a different browser than the one the
     till was open in); the outcome is otherwise accepted from anyone holding bar authority
     tonight. The outcome is a claim, exactly as trustworthy as a tap on "charged" today, and the
     SumUp transaction code it carries is recorded so a fabricated one shows at reconciliation.
  4. A success re-runs the whole cross-check against the database as it stands and posts the sale
     as F-122 and F-123 describe. If the basket can no longer be sold (the booking was collected
     at the desk meanwhile, the house filled), the attempt is marked mismatched with the reason,
     nothing is written, and staff are told the reader has money the ledger does not.
  5. A failure or cancellation reported by the app restores the basket. An attempt with no answer
     shows "did it go through?" on the till with three answers: it did (optionally with the code
     from the SumUp app), it did not, check again. An unanswered attempt is abandoned by a sweep
     after `SUMUP_ATTEMPT_TIMEOUT_MINUTES`; a stuck completion is marked mismatched after ten
     minutes. Every transition is a conditional write, so two answers cannot both land.
  6. The till lists tonight's open attempts so the laptop can resolve one a phone left behind;
     closing the till is refused while any attempt is still open (mismatched ones do not block,
     they are reconciliation facts).
  7. A ticket line inside an open attempt cannot be charged again by hand until the attempt is
     resolved, so the phone and the laptop cannot both record one customer.
  8. Added 24 September 2026 (issue 1258): before the app is opened, the cross-check also reads
     whether on-hand covers everything the basket would deplete, summed across its lines, and a
     basket it does not cover is refused with the sale's own stock wording; no attempt is written.
     The read is advisory: the trigger on the sale's write stays what holds (F-105 criterion 5),
     so a race lost between the hand-off and the answer still lands as criterion 4's mismatch.
- Source: SumUp Payment Switch (developer.sumup.com/terminal-payments/payment-switch, and the
  sumup-android-url-scheme and sumup-ios-url-scheme references); decision 0069; Matt's
  direction, 13 September 2026; issue 1258 (a stock-out found only after the reader took the
  money), with the IT Manager's direction to check and grey out rather than hold stock.

## F-125: The till opens at a venue with nothing running

- Role: Bar staff
- Phase: MVP
- Story: As tonight's bar staff on an external hire, I want the till to open with no performance
  running so that a bar the theatre has planned takes money the same way every other bar does.
- Depends on: F-101, F-102, E-130; decision 0077
- Acceptance criteria:
  1. A person holding a confirmed shift on tonight's bar opening at a venue opens the till there,
     reaching it as `via: 'SHIFT'`, with an empty performance list and the opening named.
  2. A holder of the bar manager's officer role opens the till at a venue with nothing running by
     naming the venue; the bypass is recorded once per night, venue and role as it always was, and
     its detail carries an empty performance list and the opening where there is one.
  3. Asking for BAR authority with nothing running and no venue named is refused 400 asking for
     the venue, not 403; a door or duty-manager request on such a night is still refused 403,
     because there is no house to work.
  4. `GET /api/till/venues` lists the venues the caller may open a session at: venues with a
     performance tonight, venues with an opening they hold a confirmed shift on, and every venue
     for a holder of the till bypass permission. The till shows a picker on the 400 and reloads
     naming the venue.
  5. A sale, a comp, an age check and a stock movement on such a night record no performance and
     are otherwise indistinguishable from a show night's; the session is still one per venue per
     night.
  6. A refusal names both ways in: a confirmed bar shift on tonight's performances or on tonight's
     bar opening at this venue, or the bar manager's role.
- Source: Module F open question 5 (till and comp authority on a night with no performance),
  answered by Matt on 15 September 2026; decision 0077.

## F-126: A bar sale on a two-house night names its own performance

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager on a matinee day, I want each sale attributed to the house it was
  served to so that one session's takings still report per performance.
- Depends on: F-105, E-127, E-131; decision 0078
- Acceptance criteria:
  1. A sale resolves its performance from the instant it happened against tonight's bar shift
     windows at the venue, not from how many performances the caller's authority happens to cover.
  2. A sale inside a bar window takes that window's performance. Amended 15 September 2026: where
     a venue's own bar offsets make two windows contain the instant, it takes the later house,
     because the drink is for the show about to go in rather than the one whose audience has left.
     A sale inside no window takes the nearest bound, ties going to the earlier performance; a
     night with no bar windows resolves no performance and the sale records none.
  3. A 14:30 sale and a 20:30 sale on a two-house day land on different performances inside one
     till session, and the session's reconciliation figure is unchanged by the split.
  4. A comp request records the house it was asked at, resolved the same way a sale's is, so an
     approved comp reports against that house rather than against the venue's whole night. The
     approver's queue stays the whole night, because an ask lapses in minutes and one narrowed to
     the house the reader has selected would let the other house's asks go undecided; each row
     names its own house instead. Giving the comp keys it to the house the ask named where the
     till's authority covers it, and resolves it afresh where it does not.
  5. The resolution is one shared function called from the sale write path, so no route decides
     which house a second way.
- Source: E-127 criterion 5 (one session, two houses); the 15 September 2026 bar review; decision
  0078.

## F-127: Guided product set-up by shape

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want to add a product by saying what shape it is, so that a can of
  cider, a house red and a cocktail each take one screen and one submission instead of four
  screens and seven.
- Depends on: F-111, F-112, F-113, F-116, F-121
- Acceptance criteria:
  1. Set-up opens on three shapes stated in the bar's own words: sold as itself, sold by measure,
     made from several things. The shape is derived from a product's live serving sizes and what
     each one pours, never stored, so a product edited later cannot contradict the shape it was
     created under and no set-up-only column exists. A serving pouring more than one stocked item,
     or sizes pouring more than one between them, reads as a recipe; a mixer choice group is a
     choice rather than a second ingredient, so attaching one leaves a measured spirit measured.
  2. The measure presets (wine, spirits, draught, packaged) fill in the serving sizes, preselected
     from the category's name, and any size may be unticked before submission. Packaged is the
     one-size preset the "sold as itself" card fills from; the other three fill "sold by measure".
     A preset may only emit a serving kind the vocabulary already holds, so category default prices
     keep resolving (0017, amended 15 September 2026).
  3. Prices pre-fill from the category defaults that resolve (F-121) and stay editable; a size
     whose price resolves nowhere does not block the submission.
  4. One submission writes the stocked item (new, or an existing one chosen by name), the product,
     its variants, its components, any choice-group attachment and the opening price rows in one
     batch, with one audit row per object created. A name collision, or any other refusal, leaves
     nothing behind.
  5. The product goes ACTIVE when every active size resolves a price and every component resolves
     to an active stocked item, and HIDDEN otherwise, with the reason naming the sizes or
     ingredients that did not resolve.
  6. A product created this way is indistinguishable from one built screen by screen: the till's
     catalogue contract is unchanged, and the product page edits it with no special case.
- Source: bar review, 15 September 2026 (set-up cost: a can of cider is four screens and seven
  submissions, house red fourteen); Matt's direction, 15 September 2026; decision 0017.

## F-128: Stock and products linked both ways

- Role: Bar manager
- Phase: MVP
- Story: As the bar manager, I want to see which products pour each stocked item and what each
  product's stock supports, so that I can retire an item or judge a shortage without holding the
  recipes in my head.
- Depends on: F-111, F-112, F-113, F-114
- Acceptance criteria:
  1. An ACTIVE serving size has at least one component, a stocked item or a choice group, so a
     sale always has something to deplete; a choice group counts on its own, since a chosen
     option is what actually pours. Activation refuses naming the sizes with neither, and an
     already-ACTIVE product refuses an edit that would empty a size's last component.
  2. Every sellable thing depletes something: this is the answer to F-111 criterion 2's open
     "resolvable recipe" question, closing known-issues' row on it.
  3. The stocked-item list carries a "Poured by" cell naming the active products that deplete the
     item, each linking to that product.
  4. A product's component rows say how many more servings the current on-hand supports at each
     size, and badge a component whose stocked item is retired or out of stock.
  5. Retiring a stocked item that active products deplete is refused, and the refusal names those
     products rather than counting them.
  6. The refusal offers to retire the item and hide its dependent products in one batch; the
     retirement carries the on-hand sum as a subquery in its own UPDATE's predicate, and the hides
     scope to the dependent products by subquery over the components, never by an id list read
     first (0006), so a delivery or a recipe change landing in the window cannot slip past.
  7. Both views derive from the existing components: no link is stored in either direction.
     Amended 24 September 2026 (issue 1258): the till's catalogue is no longer untouched, since it
     carries criterion 8's servings, derived the same way and stored nowhere either.
  8. Added 24 September 2026 (issue 1258): the till's catalogue carries, per size, the servings
     the current on-hand supports, read as criterion 4 reads them in one query over every active
     product that binds no parameter per product (0006). A size with none left reads "Out of
     stock" in the size sheet, and a product whose every size is out reads it on its tile. Once
     any stocktake has been applied the button is disabled too; before then, the cutover count
     has not set a trusted balance (0080), so the label shows and the button stays live. The
     label is advice, because the catalogue is held on the device and can trail the shelf: the
     trigger on the sale's write stays what holds (F-105 criterion 5), and the till reads the
     catalogue again whenever it comes back to the screen.
- Source: bar review, 15 September 2026 (known issues: the retirement guard reads on-hand before
  the write, and the empty-recipe gap); Matt's direction, 15 September 2026 (every sellable thing
  depletes something); issue 1258, with the IT Manager's direction to grey out rather than hold
  stock.

## F-201: Reader-initiated checkout

- Role: Bar staff
- Phase: Resolved, won't build (SP-1 refused, 26 August 2026)
- Story: Withdrawn. The SU's SumUp merchant account does not grant the society developer toolkit
  access, so the till cannot drive the reader.
- Resolution:
  1. The typed expected-total cross-check (F-104) is the permanent till flow, not a fallback.
  2. Decision 0005 records the refusal; revisit only via a superseding decision record if the SU
     changes its position.
  3. Amended 14 September 2026: the refusal stands for the reader API and SDK. The SumUp app's own
     Payment Switch hand-off needs neither and is built as F-124 under decision 0069; the typed
     cross-check remains the laptop's flow and the fallback everywhere.
- Source: SP-1 outcome in `../spikes.md`; decisions 0005 and 0069; Get-In constraint 1.

## F-202: Multi-venue bars

- Role: Bar manager
- Phase: V2
- Story: As the bar manager, I want bars running in more than one venue at once so that an external
  hire or a festival night does not queue behind the main house.
- Depends on: F-102, F-114, F-118
- Acceptance criteria:
  1. Sessions open concurrently across venues, still exactly one per venue per night; till access
     is scoped to the venue of the staff member's confirmed shift.
  2. Stock locations are per venue; transfers between venue bars post paired movements netting
     zero, so estate-wide on-hand is unchanged by a transfer.
  3. Reconciliation and reports filter per venue and aggregate across the estate, and the expected
     Z figure remains a single whole-day number.
  4. Products, variants, recipes and prices are shared estate-wide; only stock and sessions are
     venue-scoped.
- Source: Prompt Book F-1; audit PR-12 (the per-venue session index already anticipated this).

## F-203: Supplier catalogue

- Role: Bar manager
- Phase: V2
- Story: As the bar manager, I want suppliers and their pack sizes on record so that deliveries
  enter at true cost and the order list speaks the supplier's language.
- Depends on: F-114, F-120
- Acceptance criteria:
  1. Suppliers carry contact details; stocked items link to supplier products with pack size and
     current cost, and an item may have more than one supplier.
  2. Entering a delivery against a supplier pre-fills unit costs from the catalogue, editable per
     delivery; the movement stores what was actually paid.
  3. Cost history per item is visible and feeds GP reporting (F-119).
  4. The suggested order list (F-120) groups by supplier with quantities rounded to whole packs.
- Source: Prompt Book F-2 (implied by par levels and ordering); audit PR-12 (no predecessor).

## F-204: Waste analytics

- Role: Bar manager
- Phase: V2
- Story: As the bar manager, I want wastage and variance analysed over time so that shrinkage
  becomes a pattern I can act on rather than a number I shrug at.
- Depends on: F-114, F-115, F-119
- Acceptance criteria:
  1. Wastage reasons come from a managed vocabulary (breakage, spoilage, spillage, line clean and
     so on) with optional free-text detail, so reasons aggregate.
  2. Reports show wastage by reason, item, category and period, in units and at cost, and stocktake
     variance trends across the season.
  3. Configurable thresholds flag anomalies (an item's variance exceeding a percentage across
     consecutive stocktakes) to the bar manager; the system notices, a human decides.
  4. All analytics derive from the existing movement ledger; no new write path is introduced.
- Source: Prompt Book F-2, P6; audit PR-12.

## F-301: Interval pre-orders

- Role: Audience account
- Phase: Later
- Story: As an audience member, I want to pre-order interval drinks so that the interval is spent
  drinking rather than queueing.
- Depends on: F-103, F-104, F-105, D-2 (reservation flow)
- Acceptance criteria:
  1. A pre-order reserves the items with no money moving online; payment happens at collection on
     the reader with the standard cross-check, honouring the SU constraint.
  2. Stock depletes at collection, not at pre-order; an uncollected pre-order releases automatically
     at the end of the night.
  3. Scope, demand and the collection-point workflow are validated with the bar team after MVP
     before any build.
- Source: Prompt Book D-3 (payment constraint), F-1; audit PR-12 (no predecessor).
