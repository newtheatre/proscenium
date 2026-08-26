# Module F: Bar

The bar till keeps the old estate's strongest invariants (one figure for money, append-only stock,
recipes over stocked ingredients) and rebuilds them around first-class serving-size variants, which
supersede the damaged container model. All money is taken in person on the SumUp reader: the till
computes, cross-checks and records; it never initiates an online charge and never touches card
data. Every sale, tab charge, comp and settlement posts to the unified ledger in integer pence, and
on-hand stock is always the sum of movements, never a stored figure.

Counts: 26 stories (21 MVP, 3 V2, 1 Later, 1 resolved won't-build).

Open questions:

- Answered 26 August: SP-1 was refused access to the SumUp developer toolkit. F-201 is resolved
  as won't-build and the typed cross-check is the permanent till flow.
- Who qualifies as an authorised tab holder in the unified system (committee only, as today, or a
  treasurer-approved list), and what is the default hard cap? The old estate's £20 was a soft nag.
- For the migration: is the imported stock-movement history authoritative for opening on-hand, or
  informational only, with the cutover physical stocktake establishing the trusted balance? And
  which of the three documented data-damage repairs run as repairs versus explicit write-offs?
- Are wastage reasons a fixed vocabulary or a bar-manager-managed list? Waste analytics (F-204)
  needs structure; free text alone cannot be reported on.
- On a night with no performance (an external hire with the bar open), who holds comp approval and
  till-opening authority, given both normally derive from the show-night rota?

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
  2. A variant with a choice group (a spirit's mixer) prompts for the choice before the line lands
     in the basket; the basket line names product, variant and chosen option.
  3. Each line prices from the variant's effective price (F-116) in integer pence; the running
     total is the sum of the lines, computed server-side on submission.
  4. Quantities are editable and lines removable before payment; an empty basket cannot be
     submitted.
  5. The screen is phone-first and one-handed per K-1: adding any variant never requires a text
     field, and touch targets meet the show-night size standard.
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
- Source: Prompt Book F-1, D-3, Get-In constraint 1; audit PR-5, PR-12.

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
- Source: Prompt Book F-1, E-3; audit PR-9, PR-12.

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
     settled in Phase 0); authorisation is checked at the write path on every charge.
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
- Source: Prompt Book F-2; audit PR-12, PR-7 (archive-not-delete judgment).

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
  4. Applying posts one adjustment movement per counted item in a single transaction, all or none,
     and freezes the stocktake.
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
  1. Reports run per period (night, week, season, custom range, on the London calendar): sales by
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

## F-201: Reader-initiated checkout

- Role: Bar staff
- Phase: Resolved, won't build (SP-1 refused, 26 August 2026)
- Story: Withdrawn. The SU's SumUp merchant account does not grant the society developer toolkit
  access, so the till cannot drive the reader.
- Resolution:
  1. The typed expected-total cross-check (F-104) is the permanent till flow, not a fallback.
  2. Decision 0005 records the refusal; revisit only via a superseding decision record if the SU
     changes its position.
- Source: SP-1 outcome in `../spikes.md`; decision 0005; Get-In constraint 1.

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
