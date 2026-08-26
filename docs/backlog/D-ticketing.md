# Module D: Box office and ticketing

Public listing, online reservation with expiring holds, the box office desk, refunds and comps,
pricing administration, season passes, and access tickets. The module is bound by the SU payment
rule: money moves only through the physical SumUp reader, in person, at the theatre, so the online
half of this module reserves and the desk takes payment (Get-In constraint 1). General admission is
the core model; capacity is a count enforced by the database, and seat maps are deliberately Later
(Get-In constraint 4).

Stories: 38 total. 30 MVP (D-101 to D-130), 5 V2 (D-201 to D-206, with D-205 resolved as
won't-build), 2 Later epics (D-301, D-302).

Open questions:

- Hold expiry default: is release at 15 minutes before curtain right for every show, or should
  high-demand performances release earlier? Enters the Phase 0 committee workshop as a
  configuration default to confirm.
- Answered 26 August: SP-1 was refused access to the SumUp developer toolkit, so D-205 is
  resolved as won't-build and the typed cross-check is permanent.
- Historical pass revenue: the old estate issued passes without writing ledger rows. Does the
  committee want a one-off backfill of pre-migration pass sales, or a dated note in the data
  dictionary that pass revenue starts at cutover?
- Waiting-list claim window: how long does an offer stand before cascading to the next person, and
  does the window shorten on the day of the performance?
- Reinstatement of an expired or cancelled reservation: desk-only, or self-service while capacity
  allows? MVP assumes desk-only (D-118) pending a committee decision.
- Concession eligibility: what evidence establishes concession status online (account state) versus
  at the desk (sighted evidence, never stored), and who maintains the concession categories?

## D-101: Public what's-on listing with honest availability

- Role: Visitor
- Phase: MVP
- Story: As a visitor, I want to browse what's on with honest availability so that I can decide
  what to see without creating an account.
- Depends on: D-121
- Acceptance criteria:
  1. Only published shows with at least one future on-sale performance appear in the listing;
     draft and archived shows return 404 on their public URLs.
  2. Each performance states one of four availability states (available, limited, sold out,
     booking closed) computed server-side; a sold-out performance shows the waiting-list entry
     point (D-113) instead of a booking button.
  3. Listing responses are edge-cacheable and column allow-listed; no internal notes, no cost
     data and no access or companion ticket types appear in the public payload.
  4. Each performance shows its effective prices from the resolved override chain (D-120), dates
     and times formatted in Europe/London, venue and running time.
  5. A performance configured for external ticketing (D-122) shows the outbound link and no
     internal booking button.
- Source: Prompt Book D-1; audit PR-1

## D-102: Show page with structured content warnings

- Role: Visitor
- Phase: MVP
- Story: As a theatregoer, I want each show's content warnings, age guidance and practical details
  stated plainly so that surprises are chosen, not sprung.
- Depends on: D-121
- Acceptance criteria:
  1. Content warnings come from a structured vocabulary, each carrying a level (mentioned,
     discussed, depicted); free-text warnings are not accepted at the write path.
  2. "Confirmed no warnings" is a distinct recorded state from "not yet assessed": the show page
     renders the two differently, and an unassessed published show is flagged on the committee
     dashboard.
  3. The show page carries age guidance, running time, interval information and latecomer policy
     alongside the warnings.
  4. Warnings and age guidance set on the show flow through to the e-ticket (D-108) and the
     show-night screens (module E) from the same rows, never re-entered.
- Source: Prompt Book D-1; audit PR-7 (vocabulary and confirmed-none carried from proscenium)

## D-103: Editorial content pages

- Role: Box Office officer
- Phase: MVP
- Story: As a committee member, I want to edit the site's editorial pages (about, history, get
  involved, technical specification) so that public copy changes by decision, without touching
  code.
- Depends on: none
- Acceptance criteria:
  1. Editorial pages are Nuxt Content markdown documents in the repository; the git history is
     the version history and the previous version of any page is always recoverable.
  2. Non-technical editors work in a rich-text editing surface in the Nuxt Studio style: a
     git-backed visual editor over the same markdown, with draft and preview states, where
     publishing commits the change and the deploy pipeline carries it live. The deploy
     dependency is accepted and stated in the editor ("live within a few minutes"), never
     hidden.
  3. Preview renders the draft exactly as the public page will, visible only to editors; every
     publish records who published and when through the commit.
  4. Policy pages share this pipeline and keep their live-value tokens (J-110): prose edits go
     through content, numbers come from configuration instantly.
  5. The four pages the old estate carried migrate with their copy; the empty stagecraft
     collection and the commented-out technical specification are rewritten, not imported blank.
- Source: Prompt Book D-1; committee direction 26 August (Nuxt Content with Studio-style
  editing); audit PR-1; Get-In part 2 (content pages: rebuild)

## D-104: Online reservation with guest checkout and per-order cap

- Role: Visitor
- Phase: MVP
- Story: As a theatregoer, I want to reserve tickets online without creating an account so that
  holding seats takes a minute, even though payment happens at the theatre.
- Depends on: D-101, D-105, D-112
- Acceptance criteria:
  1. Guest checkout requires only a name and an email address; a reservation from a signed-in
     account attaches to that account.
  2. At most 10 tickets per order, enforced both per line and as the order total; an order over
     the cap is refused with the box office contact for larger parties.
  3. A reservation writes the reservation row and its price-snapshotted tickets in one atomic
     batch with status PENDING; no ledger entry is written, because no money has moved.
  4. Booking is refused with a stated reason when the performance is not on sale, the show is
     unpublished, ticketing is external, or the booking window (D-112) has closed.
  5. Reservation endpoints are rate limited (30 per 10 minutes per IP, 8 per hour per email
     address) and every refusal is enumeration-safe.
  6. A guest who later registers with the same verified email address sees their guest
     reservations in their account (module A claim flow).
- Source: Prompt Book D-2; audit PR-2

## D-105: Capacity enforced by the database

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want capacity enforced by a database constraint so that overselling
  is impossible whatever the application code does.
- Depends on: none
- Acceptance criteria:
  1. Two simultaneous reservations for the last remaining tickets can never both succeed: the
     loser receives a 409 and no partial rows; verified by an automated race test named as a
     regression case in CI.
  2. No code path reserves by read-then-write: the capacity check is a constraint or an atomic
     conditional write, never an application-level count followed by an insert.
  3. Refunded, cancelled and expired tickets leave the capacity count immediately, and reinstating
     any of them re-checks capacity (D-118).
  4. Lowering a performance's capacity below the number already sold or held is refused quoting
     both figures; deliberate oversell is done only by raising capacity, and every capacity change
     is an audited action recording actor, old and new values.
- Source: Prompt Book D-2, K-1; audit PR-2 (defect: read-then-write race), PR-7; Get-In part 2
  (reservations: rebuild)

## D-106: Expiring holds with automatic release

- Role: Visitor
- Phase: MVP
- Story: As a theatregoer, I want my unpaid reservation to hold seats honestly so that my seat is
  safe until near curtain, and a seat nobody collects goes back on sale instead of squatting
  forever.
- Depends on: D-104
- Acceptance criteria:
  1. Every unpaid reservation carries an expiry timestamp, defaulting to 15 minutes before
     curtain; the default is configurable per show through the settings surface (module J), and
     the e-ticket and confirmation email state the expiry plainly.
  2. On expiry, a scheduled job releases the tickets: capacity returns to sale, the door screen
     reflects the release, and the waiting list (D-113) is offered the freed tickets in order.
  3. An expired reservation is recorded as expired with its timestamp, never deleted, so no-show
     and expiry statistics can be reported per show and per season.
  4. Collection (D-114) clears the expiry: a paid reservation never expires.
  5. Release is idempotent and race-safe against a simultaneous collection at the desk: exactly
     one of collection or expiry wins, verified by an automated test.
  6. The release job's actions are attributed to system in the audit trail; it releases holds and
     nothing else (it never cancels paid tickets and never touches money).
- Source: Prompt Book D-2, P6; audit PR-3 (defect: immortal PENDING holds); Get-In part 2
  (reservations: rebuild, "the immortal PENDING dies")

## D-107: Hold expiry reminders

- Role: Audience account
- Phase: MVP
- Story: As a booker, I want a reminder before my unpaid hold expires so that losing my seats is a
  choice I failed to act on, not a surprise.
- Depends on: D-106
- Acceptance criteria:
  1. The holder is emailed at a configurable interval before expiry (default confirmed in the
     Phase 0 workshop), naming the performance, the expiry time in Europe/London and what to do:
     pay at the desk, or cancel to free the seats.
  2. Exactly one reminder is sent per reservation per expiry timestamp; an extended or edited
     hold re-arms the reminder, and the send is claimed race-safely so two job runs cannot both
     send.
  3. Reminders are transactional messages: they deliver regardless of marketing preferences
     (module H).
  4. A reservation collected or cancelled before the reminder time sends nothing.
- Source: Prompt Book D-2 ("the holder is reminded before expiry"); audit PR-15 (booking reminder
  email designed but never wired)

## D-108: One stable QR per booking, wallet-saveable

- Role: Visitor
- Phase: MVP
- Story: As a booker, I want one QR code for my booking that never changes so that whatever is
  saved in my wallet on night one still works at the door.
- Depends on: D-104
- Acceptance criteria:
  1. The QR is a stable retrieval key for the booking, issued once at reservation and never
     reissued; it carries no state itself. Paid, unpaid, cancelled or exchanged is whatever the
     system answers when the code is presented, so the door always sees the live truth and
     nothing saved earlier can go stale.
  2. The confirmation email is sent once at reservation with the QR and states UNPAID prominently
     with the amount due at the desk; the booker can request a resend at any time, rate limited,
     and a resend carries the same QR.
  3. The QR can be saved to Apple Wallet and Google Wallet from the email and from the booking
     page.
  4. Opening the QR link in a browser exchanges its signed token for a short-lived httpOnly
     cookie (60 minutes) so the credential never sits in history or referrer headers; the booking
     reference alone is never a credential.
  5. At the door (module E), scanning retrieves and displays the booking's current state: paid,
     unpaid with amount due, cancelled (refused with reason), exchanged (pointing at the current
     performance), or wrong night, each loudly distinct.
- Source: Prompt Book D-2, D-4; committee direction 26 August (stable QR, wallet passes); audit
  PR-2, PR-3 (signed-token-to-cookie pattern carried)

## D-109: Member and concession pricing from account state

- Role: Audience account
- Phase: MVP
- Story: As a member, I want member and concession prices applied automatically from my account so
  that the right price never depends on the desk remembering to ask.
- Depends on: D-104
- Acceptance criteria:
  1. A signed-in booker's entitled ticket types and prices come from verified account state
     (current membership year, recorded concession status), applied automatically at reservation.
  2. Entitlements arrive via a session-scoped call separate from the public listing payload, so
     public responses stay cacheable and never vary per viewer.
  3. Guest checkout offers concession types with the entitlement checked at collection: the desk
     screen prompts for sighted evidence, and the evidence itself is never stored.
  4. The price snapshotted onto the ticket (D-120) is the entitled price at reservation time; a
     membership lapsing between reservation and collection does not reprice a snapshotted ticket.
- Source: Prompt Book D-2, A-2; audit PR-1 (session-scoped entitlements call)

## D-110: Self-service edit and cancel while unpaid

- Role: Audience account
- Phase: MVP
- Story: As a booker, I want to change or cancel my unpaid reservation myself so that a changed
  plan does not need a phone call.
- Depends on: D-104, D-108
- Acceptance criteria:
  1. While a reservation is unpaid, the booker can add or remove tickets, with quantities
     expressed as desired totals per ticket type and each type appearing at most once.
  2. A reservation must keep at least one ticket; net capacity is re-checked on any increase and
     the whole edit fails atomically if capacity is short.
  3. Self-cancel works while unpaid and before curtain-up; it records who cancelled (customer),
     frees capacity immediately and sends a confirmation email.
  4. All unpaid changes are free, because no money has moved; after collection, the self-service
     surface offers only the refund policy text and the box office contact (D-116).
  5. The booking's QR is unchanged by any edit (D-108): it retrieves the booking's current
     state, so nothing needs reissuing and nothing saved in a wallet goes stale.
- Source: Prompt Book D-4; audit PR-3

## D-111: Self-service exchange to another performance

- Role: Audience account
- Phase: MVP
- Story: As a booker, I want to exchange my unpaid reservation to another performance of the same
  show so that a changed evening is a click, not a cancel-and-rebook.
- Depends on: D-110
- Acceptance criteria:
  1. Exchange moves an unpaid reservation to another on-sale performance of the same show,
     subject to that performance's capacity and booking window, atomically: the original seats are
     not released until the new ones are secured.
  2. Prices re-snapshot against the target performance's effective prices, and the booker sees
     the new total before confirming.
  3. Exchange resets the hold expiry against the new performance's curtain time (D-106).
  4. The exchange is recorded on the reservation history, the e-ticket re-issues and the old QR
     invalidates.
  5. Exchange to a different show is refused; that path is cancel and rebook.
- Source: Prompt Book D-4; audit PR-3 (edit-while-PENDING carried, exchange is new)

## D-112: Booking window per performance

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want a booking window per performance so that online booking
  closes when the desk needs the house settled.
- Depends on: D-121
- Acceptance criteria:
  1. Each performance carries a booking-closes offset (hours before curtain), inherited from a
     show-level default where unset, editable by box office staff and audited.
  2. After the window closes, online reservation is refused with the closing time quoted in
     Europe/London and the door directed as the alternative.
  3. Desk reservations may bypass the customer window; the bypass is recorded on the reservation.
  4. The listing (D-101) shows "booking closed" the moment the window passes, not on the next
     cache refresh beyond the stated cache lifetime.
- Source: Prompt Book D-2, P5; audit PR-2, PR-5

## D-113: Waiting list for sold-out performances

- Role: Visitor
- Phase: MVP
- Story: As a theatregoer, I want to join a waiting list for a sold-out performance so that a
  released seat finds me instead of whoever refreshes fastest.
- Depends on: D-101, D-106
- Acceptance criteria:
  1. A sold-out performance offers a waiting-list form (name, email, party size); joining is
     confirmed by email and duplicate joins for the same email and performance are refused.
  2. When tickets free (expiry, cancellation, refund, capacity raise), the list is offered in
     join order: an offer email carries a claim link valid for a configurable window, and the
     claim converts to an ordinary reservation through D-104's write path, capacity-checked.
  3. An unclaimed offer lapses on its window and the next entry is offered; each offer and lapse
     is recorded, and the claim is race-safe so one freed ticket can never be claimed twice.
  4. Waiting-list entries for a performance are purged after that performance's night; the booker
     can remove themselves at any time from a link in every email.
  5. The desk sees the list's length and next entries on the performance screen, and can offer to
     the list manually.
- Source: Prompt Book D-1, D-2, D-5; audit PR-15 (no predecessor: new behaviour)

## D-114: Desk search and collection with expected-total cross-check

- Role: Box Office officer
- Phase: MVP
- Story: As box office at the desk, I want to find a booking fast and collect it against a
  server-computed total so that a queue moves and a mistyped reader amount is caught before it
  becomes a reconciliation mystery.
- Depends on: D-104, D-108
- Acceptance criteria:
  1. The desk screen shows today's performance with previous and next, and finds bookings by
     reference, QR scan or name search; results are paged and limited.
  2. Collection is the payment boundary: before it a booking is editable, after it changes are
     refunds (D-116), never both; un-collecting a paid booking is refused quoting the stranded
     amount.
  3. Every money-taking action sends the expected total in pence; a mismatch with the server's
     computed total is a 409 refusal quoting both figures, because a human typed that number into
     the SumUp reader.
  4. Tender is CARD or COMP only; the theatre takes no cash and the system records money, never
     initiates a charge and never touches card data.
  5. The ledger entry (module I) posts at the moment of collection with source, actor and
     references, and never before.
  6. Collection clears the hold expiry (D-106) and marks every ticket in the booking collected in
     one atomic write.
- Source: Prompt Book D-2, D-3, D-5, P4; audit PR-5; Get-In constraint 1, part 2 (collection:
  carry)

## D-115: Walk-up sales recorded as door source

- Role: Box Office officer
- Phase: MVP
- Story: As box office on the door, I want walk-up sales recorded as door sales so that pre-booked
  and on-the-door revenue are distinguishable in every report.
- Depends on: D-114
- Acceptance criteria:
  1. A walk-up sale creates the reservation and takes payment in one desk flow; the reservation
     is written with source DOOR at creation, never defaulted to the web source.
  2. Every report and export that touches revenue or attendance can split web and door sources;
     the source is immutable after creation.
  3. Desk-created reservations allow up to 20 tickets per line with no order total cap, and may
     bypass the customer booking window with the bypass recorded.
  4. The expected-total cross-check (D-114) applies to walk-up payment exactly as to collection.
  5. Pre-migration reservations keep their known source blur, documented in the data dictionary;
     no historical reclassification is attempted.
- Source: Prompt Book D-5; audit PR-5 (defect: walk-ins written as PENDING/WEB); Get-In part 2
  (walk-ins: rebuild, fixed by construction)

## D-116: Refunds, in person, per ticket, race-safe

- Role: Shift authority
- Phase: MVP
- Story: As the duty manager, I want refunds recorded per ticket with my approval so that revenue
  and capacity stay true after money is handed back at the desk.
- Depends on: D-114
- Acceptance criteria:
  1. Refunds are in person by policy: money was taken on the reader, so it is handed back the
     same way; the system records the refund, it performs no card reversal.
  2. Refunding requires manager approval (a money.refund permission held by manager and admin
     roles, or tonight's confirmed duty manager); the approver is recorded on every refund row.
  3. Refunds are recorded per ticket, newest tickets of the requested type first, each writing a
     ledger entry (module I) at the moment the money is handed back.
  4. Concurrent refunds of the same ticket are detected atomically (row-claiming update); the
     loser receives a 409 and no ledger entry, verified by a named regression test (the
     double-refund case).
  5. Refunded tickets leave capacity, revenue and the customer's booking view immediately.
  6. Cancelling a booking that still holds unrefunded money is refused quoting the stranded
     amount: refund first, then cancel.
- Source: Prompt Book D-4, P2, P4; audit PR-6; Get-In part 2 (refunds: carry), part 5 (double
  refund as named regression case)

## D-117: Comps requested, approved and ledgered at zero

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want comps requested with a reason and approved by me so
  that giveaways carry a sign-off and appear in the accounts as foregone revenue, not silent gaps.
- Depends on: D-114
- Acceptance criteria:
  1. A comp is requested with a mandatory reason; approval authority is tonight's confirmed duty
     manager shift or a manager role, never general box office.
  2. A pending comp request expires after 10 minutes, with expiry derived at read time so a slow
     sweep cannot extend it; approval claims the decision atomically before any ticket or ledger
     row is written.
  3. An approved comp writes a zero-value ledger entry carrying the full-price lines and the
     approver's identity, so foregone revenue is a queryable figure.
  4. Comp tickets count against capacity exactly like paid tickets, and are reported per show and
     per season, split out from paid revenue in every report.
  5. A declined request records the decision and decliner; the requester sees the outcome.
- Source: Prompt Book D-5, P3, P4, I-1; audit PR-5, PR-10

## D-118: Reinstatement with capacity re-check

- Role: Box Office officer
- Phase: MVP
- Story: As box office, I want to reinstate an expired or cancelled reservation so that a booker
  who turns up after their hold released is helped, not turned away, when the house allows it.
- Depends on: D-106, D-114
- Acceptance criteria:
  1. The desk can reinstate an expired or customer-cancelled unpaid reservation; reinstatement
     re-runs the capacity check atomically and is refused with current availability quoted if the
     freed tickets have been resold.
  2. Reinstatement keeps the booking's original QR (D-108, a stable retrieval key) and sets a
     fresh hold expiry; the original expiry record survives for no-show statistics (D-106).
  3. A reservation whose tickets were offered to and claimed by the waiting list cannot be
     reinstated over the claimants; the refusal names the reason.
  4. Every reinstatement records actor, reason and timestamp on the reservation history.
  5. Refunded (previously paid) tickets are never reinstated through this path; that is a new
     sale.
- Source: Prompt Book D-5 (releases and door flow); audit PR-3, PR-5 (no predecessor for
  reinstatement: new behaviour required by expiring holds)

## D-119: Ticket type administration, archive never delete

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want global ticket types I can retire but never destroy so
  that historical sales always resolve to the type they were sold under.
- Depends on: none
- Acceptance criteria:
  1. Ticket types (standard, member, concession, and any committee-defined type) are global with
     globally unique names, each carrying a base price in integer pence.
  2. A ticket type that has ever been sold can only be archived, never deleted; an archived type
     stops appearing for new sales but resolves for every historical ticket, report and export.
  3. A ticket type that has never sold may be deleted outright.
  4. Access and companion ticket types are flagged as such and never appear in any public payload
     (D-128).
  5. Creation, archive and price changes are audited with actor and old and new values.
- Source: Prompt Book D-1, D-8; audit PR-7

## D-120: Price overrides with NULL-means-inherit, snapshots on tickets

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want per-show and per-performance price overrides so that
  unusual pricing is configuration, while every ticket remembers the price it actually sold at.
- Depends on: D-119
- Acceptance criteria:
  1. Effective price resolves performance override, then show override, then the type's base
     price; a NULL at any level means inherit from the level above, and an explicit value means
     override, including an explicit zero.
  2. The admin surface displays the resolved effective price at each level alongside its source
     (base, show or performance), so an operator can see why a price is what it is.
  3. The effective price is snapshotted onto each ticket at reservation; a later override change
     never repriced an existing ticket, and refunds repay the snapshotted amount.
  4. All prices are integer pence at every layer; formatting to pounds happens only at display.
  5. Override changes are audited and take effect for new reservations only.
- Source: Prompt Book D-1, P4; audit PR-1, PR-7; Get-In part 2 (override pricing: carry)

## D-121: Show and performance publish flow

- Role: Box Office officer
- Phase: MVP
- Story: As the committee, I want a deliberate publish flow for shows and performances so that
  nothing goes on sale by accident and nothing sold ever vanishes.
- Depends on: D-119
- Acceptance criteria:
  1. Shows carry slug, copy, age guidance, latecomer policy and content warnings (D-102) in a
     draft state invisible to the public until published.
  2. Publishing a show can cascade its performances to on-sale in one action, skipping cancelled
     performances; individual performances can also be put on and off sale independently.
  3. Show and performance administration stays at today's level: a show is created directly by
     the committee, and the future programming module (module B, Later) will feed this flow
     rather than replace it.
  4. Unpublishing a show with sold tickets does not touch the tickets; it removes the public page
     and closes sales, and the act is audited.
  5. A performance with sold tickets cannot be deleted; it can be cancelled, which triggers the
     refund workflow for collected bookings and notification to all ticket holders.
- Source: Prompt Book D-1; audit PR-7; Get-In constraint 2, part 2 (shows and publish flow:
  carry)

## D-122: External ticketing link-out per performance

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want a performance to hand its ticketing to an external
  provider so that co-productions and festival slots are configuration, not workarounds.
- Depends on: D-121
- Acceptance criteria:
  1. A performance may carry an external ticketing URL; while set, the public page shows the
     link-out and every internal sales path (online reservation, desk walk-up, pass redemption,
     waiting list) refuses for that performance with the link quoted.
  2. Internal capacity, door scanning and reports state plainly that the performance is
     externally ticketed rather than showing misleading zeros.
  3. Setting and clearing the external URL is audited; clearing it re-opens internal sales only
     by an explicit on-sale action, never automatically.
- Source: Prompt Book D-8; audit PR-1, PR-2

## D-123: Season pass products

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want pass products with validity windows, price points and
  issue caps so that a season pass is a configured product, not a spreadsheet.
- Depends on: D-119
- Acceptance criteria:
  1. A pass product carries a validity window, a sales window, one or more price points in
     integer pence, the set of covered shows, and a maximum-issued cap.
  2. Issuing beyond the cap is refused with a 409: the blunt guard against selling 200 passes
     into an 86-seat house.
  3. A pass product that has ever been issued can only be archived, never deleted; archived
     products resolve for every held pass and report.
  4. Covered shows can be extended during the season (additive); removing a covered show from a
     product with live passes requires a manager role and is audited.
  5. Product creation and changes are audited with actor and diff.
- Source: Prompt Book D-7; audit PR-8; Get-In constraint 7, part 2 (passes: carry, now MVP)

## D-124: Pass issue at the desk and online request-and-collect

- Role: Box Office officer
- Phase: MVP
- Story: As box office, I want to issue passes at the desk on the reader, including ones requested
  online, so that loyalty is paid for in person (the SU rule) but arranged from a sofa.
- Depends on: D-114, D-123
- Acceptance criteria:
  1. A pass is sold at the desk with payment on the SumUp reader, under the expected-total
     cross-check (D-114); issue attaches the pass to the buyer's account.
  2. Issuing a pass writes a pass-sale ledger entry at the moment of payment, so pass revenue
     reaches reconciliation and the night's expected Z figure (fixing the old estate's missing
     PASS_SALE rows).
  3. A signed-in member can request a pass online; a request reserves nothing, admits nobody and
     expires if unfulfilled by the end of the product's sales window, and the desk sees pending
     requests by name for one-tap fulfilment at payment.
  4. Issue respects the product cap (D-123) atomically at payment, not at request: requests may
     exceed the cap, issues may not.
  5. The holder receives the pass by email with a scannable QR and can view it in their account.
- Source: Prompt Book D-7; audit PR-8 (defect: pass sales never ledgered); Get-In constraint 1,
  part 2 (missing pass-sale ledger fixed by the unified ledger)

## D-125: Self-serve pass redemption while reserving

- Role: Audience account
- Phase: MVP
- Story: As a pass holder, I want my pass to cover my seat while I reserve online so that using
  the pass is the default path, not a desk conversation.
- Depends on: D-104, D-124
- Acceptance criteria:
  1. During reservation for a covered performance inside the validity window, the holder's pass
     is offered automatically; redemption creates an ordinary zero-value admission ticket.
  2. Once per performance is enforced by a database uniqueness constraint on (pass, performance);
     a second redemption attempt is refused, including under concurrent requests.
  3. Capacity still applies in full: a pass is entitlement, not a reserved seat, and redemption
     into a full house is refused with the waiting list offered.
  4. A redeemed ticket follows the ordinary lifecycle: it appears on the e-ticket, scans at the
     door, and cancelling it frees both the capacity and that performance's redemption.
  5. Redemption writes a zero-value ledger line referencing the pass, so per-admission
     utilisation is queryable per product and per pass.
- Source: Prompt Book D-7; audit PR-8 (UNIQUE(pass, performance) carried)

## D-126: Pass scanning at the door from day one

- Role: Shift authority
- Phase: MVP
- Story: As door staff, I want to scan a pass like a ticket so that pass holders queue once, and
  the screen the old estate never built exists from the first night.
- Depends on: D-125
- Acceptance criteria:
  1. The door screen scans a pass QR: a valid pass with a redemption for tonight admits in one
     gesture; a valid pass without one offers to redeem on the spot, capacity-checked, recorded
     as source DOOR.
  2. An invalid state is refused loudly and specifically: expired validity window, performance
     not covered, already admitted tonight, or product archived.
  3. Pass admissions appear in the night's attendance and the night report split out from paid
     and comp admissions.
  4. Door redemption respects the same uniqueness and capacity rules as self-serve (D-125); no
     door path can admit a pass twice for one performance.
- Source: Prompt Book D-7, D-5; audit PR-8 (FOH pass tile dead: "Passes coming 26/27"); Get-In
  part 2 (the unbuilt door screen ships day one)

## D-127: Access profile, verified and consent-gated

- Role: Audience account
- Phase: MVP
- Story: As a patron with access requirements, I want to state them once and control exactly what
  the door sees so that every visit is accommodated without repeating myself.
- Depends on: none
- Acceptance criteria:
  1. A self-declared profile carries structured need flags, a companion entitlement of 0 to 2,
     and an optional note; evidence such as an access card is sighted at verification and never
     stored.
  2. Nothing is shown to any staff surface until all three hold: verified, explicit
     front-of-house consent given, and not expired; verification is performed by a named
     accessibility officer role, never by general box office.
  3. The door sees agreed operational wording only (for example "aisle seat, assistance dog"),
     never need flags, diagnosis or the applicant's own note; night reports carry counts only.
  4. Profile data is special category: encrypted at rest, excluded from every export except the
     person's own, and excluded from staff search.
  5. Withdrawal deletes the profile outright after a 30-day tombstone; GDPR erasure deletes it
     immediately; a withdrawn profile cannot be reinstated by anyone but its owner.
- Source: Prompt Book D-6; audit PR-4; Get-In part 2 (access profiles: carry, add encryption at
  rest)

## D-128: Access tickets and companion seats

- Role: Audience account
- Phase: MVP
- Story: As a verified access patron, I want to book my seat and my companions like anyone else so
  that accessible booking is the same flow, not a phone number.
- Depends on: D-104, D-127
- Acceptance criteria:
  1. A booker with a verified, consented, unexpired profile sees the access ticket type and their
     companion entitlement in the ordinary reservation flow; nobody else ever sees these types.
  2. Entitlement is per performance: one access ticket (the holder's own seat) plus companions up
     to the verified entitlement, counted against what the holder already has for that
     performance, including desk-made bookings.
  3. Companion tickets price at zero, snapshot at zero, write zero-value ledger lines and count
     fully against capacity.
  4. Access and companion tickets scan at the door like any ticket; the door screen shows the
     agreed wording (D-127) with the booking and nothing more.
  5. Exceeding the entitlement is refused naming the limit, not the profile contents.
- Source: Prompt Book D-6; audit PR-1, PR-4

## D-129: Ticket export with row cap and formula-injection guard

- Role: Box Office officer
- Phase: MVP
- Story: As the box office manager, I want ticket data exportable safely so that season reporting
  works in a spreadsheet without a crafted name executing in one.
- Depends on: D-114
- Acceptance criteria:
  1. Export produces CSV filtered by show, performance, date range and source; every export is
     paged in SQL and capped at 20,000 rows, refusing (never truncating silently) beyond the cap
     with guidance to narrow the filter.
  2. Every cell that could begin with =, +, - or @ is guarded against CSV formula injection.
  3. Columns are explicitly allow-listed: reference, performance, type, snapshotted price,
     source, collected and refunded states; no internal notes and no access data ever export.
  4. Exports of personal data are audited with actor, filter and row count.
  5. The season boundary for reporting runs 1 August to 31 July.
- Source: Prompt Book D-1 reporting, K-1; audit PR-7 (20,000-row cap and injection guard carried)

## D-130: Admit a Fellow on their lifetime entitlement

- Role: Audience account
- Phase: MVP
- Story: As a Fellow of the theatre, I want my free admission to work like any other booking so
  that I choose a seat in the ordinary way and the door lets me in without a conversation.
- Depends on: D-128, A-127
- Acceptance criteria:
  1. A Fellow books through the ordinary reservation flow; the entitlement resolves the price to
     zero and snapshots it as zero, and the line posts to the ledger at zero value like a
     companion ticket.
  2. Capacity applies unchanged: the entitlement is admission at no charge, not priority and not
     a guaranteed seat, so a sold-out performance is sold out for a Fellow too (0006, 0023).
  3. Admission is recorded append-only, at most once per performance, through the same pass
     admission path the door already scans; a second attempt on the same performance is refused
     with the first admission quoted.
  4. A revoked fellowship refuses new bookings and new admissions, and admissions already taken
     stay valid in the record.
  5. Reports count fellowship admissions separately from paid and comped ones, by count and by
     value, never by name.
  6. Nothing in the public booking path reveals who holds a fellowship.
- Open questions: whether the entitlement covers a guest seat, which ships as no guest until the
  committee decides; and whether it covers external hires, which ships as our own productions
  only, because an external hire's house is not ours to give away.
- Source: Committee direction, 26 August 2026; decision 0023.

## D-201: Named allocations reserve capacity without tickets

- Role: Box Office officer
- Phase: V2
- Story: As the box office manager, I want named allocations (press, crew, society blocks) so that
  held-back capacity is visible configuration, not a sticky note on the real capacity number.
- Depends on: D-105, D-121
- Acceptance criteria:
  1. An allocation names a purpose and a quantity against one performance; allocated capacity is
     excluded from public sale but included in the house total, and the sum of allocations can
     never exceed remaining capacity.
  2. Tickets can be issued from an allocation by the desk, drawing the allocation down; issue
     beyond the allocation falls through to general capacity only by explicit choice.
  3. The performance screen shows sold, held, allocated and free as distinct figures.
  4. Creating, resizing and releasing allocations is audited.
- Source: Prompt Book D-8; audit PR-8; Get-In part 2

## D-202: Allocation release on a date

- Role: Box Office officer
- Phase: V2
- Story: As the box office manager, I want allocations to release automatically on a date so that
  unused press seats return to sale without anyone remembering.
- Depends on: D-201
- Acceptance criteria:
  1. An allocation may carry a release timestamp; at that moment a scheduled job returns its
     unissued quantity to general sale, attributed to system in the audit trail.
  2. Released capacity is offered to the waiting list (D-113) before opening to general sale,
     in list order.
  3. The allocation record survives release with its issue history intact; release is idempotent
     under repeated job runs.
- Source: Prompt Book D-8, P6

## D-203: Waiting-list refinements

- Role: Audience account
- Phase: V2
- Story: As someone on a waiting list, I want to see where I stand and set my limits so that
  waiting is informed, not hopeful.
- Depends on: D-113
- Acceptance criteria:
  1. A waiting-list entry shows its live position and party size, and can be edited (party size
     down only) without losing position.
  2. Offer cascade tuning is configuration: claim window length, a shorter same-day window, and
     the number of simultaneous offers per freed block.
  3. An entrant can register for multiple performances of a show with one action and is
     automatically removed from the others when they claim one.
  4. Per-show waiting-list analytics (joins, offers, claims, lapse rate) inform capacity and
     programming decisions.
- Source: Prompt Book D-1, D-5; audit PR-15

## D-204: Discount codes

- Role: Box Office officer
- Phase: V2
- Story: As the box office manager, I want discount codes with windows and usage caps so that
  promotions are configuration with an audit trail, not a desk habit.
- Depends on: D-104, D-120
- Acceptance criteria:
  1. A code carries a discount (percentage or pence), a validity window, a usage cap, and an
     optional show scope; redemption at reservation is atomic against the cap.
  2. The discounted price snapshots onto the ticket with the code referenced, so the foregone
     amount is queryable per code.
  3. Expired, exhausted and out-of-scope codes are refused with the specific reason.
  4. Code creation and changes are audited; a code that has been redeemed is archived, never
     deleted.
- Source: Prompt Book D-2; audit PR-7 (no predecessor: new behaviour)

## D-205: Reader-initiated checkout via the SumUp API

- Role: Treasurer
- Phase: Resolved, won't build (SP-1 refused, 26 August 2026)
- Story: Withdrawn. The SU's SumUp merchant account does not grant the society developer toolkit
  access, so the reader cannot be driven by the system.
- Resolution:
  1. The typed expected-total cross-check (D-114) is the permanent flow, not a fallback; its
     wording and training material state it as such.
  2. Decision 0005 records the refusal. Revisit only if the SU changes its position, via a
     superseding decision record.
- Source: SP-1 outcome in `../spikes.md`; decision 0005; Get-In constraint 1.

## D-206: Sales, no-show and utilisation reporting exports

- Role: Treasurer
- Phase: V2
- Story: As the treasurer, I want period exports for sales, no-shows and pass utilisation so that
  the SU's oversight and the committee's review cost one download each.
- Depends on: D-106, D-125, D-129
- Acceptance criteria:
  1. Period reports export per show, per performance and per season: revenue by source (web,
     door, pass, comp), refunds, and foregone revenue from comps and discounts as explicit lines.
  2. No-show and hold-expiry statistics report from the recorded expiries (D-106), never from
     inference.
  3. Pass utilisation reports admissions per pass and per product against price paid.
  4. All exports respect the row cap, the formula-injection guard and the column allow-list
     rules from D-129.
- Source: Prompt Book D-7, I-3; audit PR-7

## D-301: Reserved-seating maps (epic)

- Role: Box Office officer
- Phase: Later
- Story: As the box office manager, I want seat maps for the rare fixed-seat venue so that
  reserved seating is available where a venue genuinely has seats to reserve.
- Depends on: D-105, D-121
- Acceptance criteria:
  1. Epic stub, to be decomposed when a fixed-seat venue is confirmed: seat map definition per
     venue, seat selection in the reservation flow, and seat-level capacity as a strict superset
     of the count model.
  2. General admission remains the default and the core model; nothing in modules D or E may
     assume a seat map exists, and every MVP flow must run unchanged for unmapped venues.
  3. Decomposition begins only after the committee names a real venue and season that needs it.
- Source: Prompt Book D-8; Get-In constraint 4 (most venues have no fixed seating; seat maps are
  Later)

## D-302: External hire ticketing (epic)

- Role: Box Office officer
- Phase: Later
- Story: As the committee, I want ticketing support for external hires so that hiring the venue
  out can include a box office service, priced and ledgered like everything else.
- Depends on: D-121, D-122
- Acceptance criteria:
  1. Epic stub, to be decomposed alongside the external-hires work in module C: hirer-scoped
     shows and performances, hire ticketing terms, and settlement of hire ticket revenue to the
     hire's invoice (module I).
  2. Until then, external hires are served by the existing per-performance link-out (D-122) and
     blackout mechanisms; nothing in the MVP model may preclude a hirer-scoped show later.
  3. Decomposition follows the production module and external-hire decisions (Get-In phase 5),
     not before.
- Source: Prompt Book C-4, D-8; Get-In part 2 and phase 5
