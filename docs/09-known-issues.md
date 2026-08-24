# Known issues

Originally the August 2026 audit of commit `9d17251`. **Last reviewed: 2026-08-12**, after a
full-repo review whose fixes landed on `fix/review-sweep-aug-2026`.

Read this before planning work, and edit it when you fix something: a handover document that
says "nothing has been fixed" long after things were fixed costs the next person more time than
having no list at all.

Severity is about consequences for the theatre, not code aesthetics:

- **P1**: customer-visible breakage, data loss risk, or exposure of personal data.
- **P2**: wrong numbers, or a foot-gun that will cause P1 later.
- **P3**: hygiene, drift, missing scaffolding.

## Open

| | Issue | Sev | Effort |
|---|---|---|---|
| 13 | [Roles are stale until re-login](#roles-are-stale-until-re-login) | P2 | Small |
| 9 | [Nothing is transactional](#nothing-is-transactional) | P2 | Medium |
| 10a | [Capacity is still read-then-write](#capacity-is-still-read-then-write) | P2 | Medium |
| 14 | [Customers cannot cancel their own booking](#customers-cannot-cancel) | P2 | Small |
| 16 | [No shared types](#no-shared-types) | P3 | Medium |
| 20a | [No tests](#no-tests) | P3 | Medium |
| 21 | [The dev server loses its D1 binding after a hot reload](#dev-d1-binding) | P3 | Small |
| 23 | [Tab sales and tab cash split across a term boundary](#tab-accrual-split) | P3 | Won't fix |

## Fixed

Kept as a record of what changed and why, so nobody re-fixes them.

| | Issue | Fixed |
|---|---|---|
| 1 | All emailed links are broken (`baseUrl` vs `baseURL`) | Casing aligned; `email.ts` reads `public.baseURL` |
| 2 | Booking confirmation links 404 | `/api/bookings/:id` accepts an id *or* a reference |
| 3 | Draft shows are publicly readable | `authorize(listShows / readShow)` on both routes |
| 4 | Walk-in lookup leaks the user table | `GET /api/users?email=` returns at most one row |
| 6 | Resend key crashes the whole worker | Client constructed lazily; missing key degrades to a no-op |
| 7 | Collection charges current prices | Existing tickets show `pricePaid` |
| 8 | `DOOR` status is never set | Walk-ins create `DOOR` |
| 24 | Bar sales and night reports counted voided transactions | `isNull(voidedAt)` added to `barLineRange()` and the night report's tender group-by |
| 25 | The sales report had a `cash` column for a tender that never existed | Replaced with `tab`, so the tender columns sum to gross again |
| 22 | `bar.tab` was not enforceable on the debtor at the till | stage-door serves `GET /api/role-holders`; the till lists names and the server refuses a debtor who is not on it |
| 11 | Publish resurrects cancelled performances | `ne(status, 'CANCELLED')` on the update |
| 12 | Refunds do not exist | `POST /api/reservations/:id/refund` (see also the lifecycle rule below) |
| 15 | Five copies of the price rule | `resolveEffectiveTicketType()` is the only copy |
| 17 | `/calendar` calls an endpoint that does not exist | Page deleted |
| 19 | Dependency hygiene | Deps declared; build tooling moved to `devDependencies` |
| 20 | No CI, no lint script | `.github/workflows/ci.yml`; `lint` / `lint:fix` scripts |
| 21 | Production migration ledger empty; `d1 migrations list` always said "nothing to apply" | `migrations_dir` pinned in `nuxt.config.ts`; ledger backfilled and `0015` applied 2026-08-13 |
| 22 | [Editing a show wiped its write-up](#editing-a-show-wiped-its-write-up) | `ShowEditModal` loads the full record from `GET /api/shows/:id`; the five projected-away fields are omitted from the PUT unless it succeeded |

### The companion entitlement was enforced per basket, not per performance

A profile entitled to one companion could hold two by making two bookings: the basket check refused
`quantity: 2` in one go and allowed `quantity: 1` twice.

`docs/12` §2.6 specifies `canBookAccessTickets(user, performance)`. The implementation took only the
user, so it could not see what was already booked and could only ever check the basket in front of
it. Fixed by giving it the performance and counting what is already held, with the edited booking
excluded and cancellations returning the entitlement. Access tickets gained the same one-per-
performance count at the same time.

### Access ticket types were offered to everyone in the public booking flow

`sellableTicketTypes()` filters on `kind` and `archived` only, so `/api/whats-on/:slug` returned the
access and companion types to logged-out visitors. The booking route refused them with a `403`, so
no free tickets and no data leak, but a guest could select "Essential companion", work through a
multi-step flow and be refused at the end.

Fixed by excluding access types from the public payload and adding
`/api/bookings/my-options`, which is session-dependent and offers them only to an entitled account.
The public show payload stays cacheable.

### Performances created before the rota existed had no shifts

`stampTemplateShifts` was called from exactly one place, `POST /api/shows/:id/performances`, so a
performance only ever got its rota at the moment it was created. Every performance predating the
rota had none, with no way to add them; the rota page's own empty state described the gap without
offering a way out.

Fixed with `POST /api/shifts/stamp` and a **Stamp missing shifts** button. It finds performances
with no shifts in one query and writes one statement per performance, so it is neither an N+1 nor a
statement whose parameters grow with the rows. Idempotent: a performance with any shift is left
alone.

### External shows were staffed, warned about and bookable

Three places treated an externally ticketed show as ours: the rota stamped shifts onto it, the
duty-manager warning demanded one for it, and the box office feed offered it for walk-ins (#136).
The booking route created reservations for it (#135). All four now check `shows.external_url`.

### Fixed in the August 2026 full-repo review

Also fixed, and worth knowing about because several were silent:

- **Stale staff sessions bypassed authorization entirely.** `nuxt-authorization`'s server
  `authorize()` swallows any non-`AuthorizationError` its resolver throws and then *resolves
  successfully*. Our resolver threw a 401 for stale role-holding sessions, so every ability check
  passed for them, and since sessions last 30 days and go stale after 15 minutes, that was the
  ordinary state of a staff session. Staleness is now expressed by dropping roles, not by throwing
  (`sessionUserForAuthorization`). **If you touch that resolver, it must never throw.**
- **GDPR erasure was silently reverted.** The mirror upsert runs on every authenticated request and
  rewrote name and email from the session, with no `anonymisedAt` guard, so an erased customer's
  own browser restored their details while the row stayed hidden from listings. See
  [04-auth-and-permissions](04-auth-and-permissions.md#erasure).
- **Internal notes were readable by customers and by the public.** `GET /api/reservations/:id`
  returned `staffNotes` and `legacyRef` to the booking's own owner; `/api/whats-on` published
  `performances.notes`. Both now use column allow-lists.
- **Nothing was rate limited.** The limiter in `server/utils/rateLimit.ts` had no callers at all.
  It is now applied in `server/middleware/rateLimit.ts`.
- **Pass products could never be sold.** Every pass type was created `DRAFT` and nothing in the app
  could change that, while the box office only offers `ON_SALE` types. `PUT /api/pass-types/:id`
  and an admin control now exist.
- **A pass's last day never worked.** `validTo` was a date-only value parsed as UTC midnight, so a
  19:30 performance on the final day fell outside validity and a one-day pass never validated at
  all. See `server/utils/validityWindow.ts`.
- **Emails quoted times an hour early.** Workers run in UTC and the two email formatters had no
  `timeZone`, so throughout BST every confirmation disagreed with the website.
- **Staff could not open a customer's booking.** The staff check compared session roles against
  bare `'ADMIN'` while roles arrive scoped as `'proscenium:ADMIN'`, so it never matched.
- Seat counting is now one shared rule (`countOccupiedSeats`); the pass door check and the public
  sold-out badge had each drifted from it in different directions.
- Refunds are bounded by the lifecycle rule below, and can no longer be double-applied.
- D1's 100-bound-parameter limit: fixed in the GDPR export hook and the public show page.
- `ticket_types.archived` and the pass bookkeeping kinds are no longer offered for sale.

---

### Editing a show wiped its write-up

Worth reading even though it is fixed, because the shape of it will recur.

`GET /api/shows` was narrowed to a column projection to stop shipping a paragraph per show across
498 of them. The projection dropped `longDescription`, `programmeUrl`, `externalUrl`,
`contentWarningNotes` and `warningsConfirmedNone`. Nothing on the admin table rendered those fields,
so the change looked safe, but `/admin/shows` passed the **list row itself** into `ShowEditModal`,
whose watcher read `show.longDescription ?? ''` on five now-absent keys and whose submit sent them
unconditionally as `null`. `PUT /api/shows/:id` guards on `!== undefined`, so `null` is a legitimate
clear and went straight through. Editing a show's *title* silently emptied its public write-up.

Three things made it survive review: the fields were absent rather than wrong, so nothing threw;
`?? ''` turned the absence into a plausible value; and the damage only showed on the public site.

The fix is on the client, not in the PUT: `null` really does mean "clear this" and that contract is
correct. `ShowEditModal` has since been replaced by the editable sections on `/admin/shows/:id`
(`Admin/Shows/DetailsSection.vue`, `ContentWarningsSection.vue`, `TicketTypesSection.vue`), which
structurally cannot reproduce this: each section is mounted on the detail page, which loads the full
record from `GET /api/shows/:id`, and each sends only the keys it owns.

**The general rule: a projected list row is not an edit source.** If a form can write a field, it
must have read that field from something that actually returns it.

---

## The reservation lifecycle rule

Not a bug, but the rule the refund and edit paths now enforce, because it was previously implicit
and the two paths contradicted each other:

**Nothing is paid until the tickets are collected.**

- **Before collection** (`PENDING`) a booking is an intention. The customer or the box office adds
  and removes tickets freely: removing one is not a refund, because nothing was taken.
- **After collection** (`COLLECTED`, `DOOR`) money has changed hands and the composition is a record
  of a transaction. It cannot be edited; the only way to reverse any part of it is a refund, which
  is ADMIN/MANAGER only and leaves `refundedAt` behind as the audit trail.

Enforced in `server/utils/reservationLifecycle.ts` and applied by both ticket-diff routes and the
refund route.

---

### Roles are stale until re-login

Roles are snapshotted into the session cookie by the auth service. Granting or removing a role has
no effect until that session refreshes: up to 15 minutes for a staff session, and a customer's
session is never staleness-checked at all (they hold no roles, so there is nothing to re-read).

The estate answer is `session_epoch`, which stage-door already bumps on erasure and force-logout.
This app cannot see it without asking the auth service on every request, which is exactly what the
staleness window exists to avoid. Live with the window, or accept a per-request check on privileged
routes only.

### Nothing is transactional

Booking creation (shadow user → reservation → tickets), ticket diffing and reservation deletion are
multi-statement. Several now use `db.batch()`, but the shadow-user round trip to the auth service
cannot be inside a batch, so a failure between it and the reservation insert still leaves an
orphaned mirror row.

D1 has no interactive transactions. The fix is `db.batch()` wherever the statements can be decided
up front, and database constraints where they cannot.

### Capacity is still read-then-write

Both write paths now call `assertCapacity`, and reinstating a cancelled reservation is checked too,
so the *bypasses* are gone. What remains is the race: the check and the insert are separate
statements, and on the public booking path there is a call to the auth service in between, so two
concurrent bookings can both pass a check that only one should.

At this booking volume that is defensible, and it is written down here rather than pretended away.
Closing it needs either a conditional insert in a batch or a per-performance lock.

### Customers cannot cancel

`updateReservation` is staff-only. `cancelledBy: 'CUSTOMER'` exists in the schema and the UI but can
only be set by staff. The legacy system had self-service cancellation via an emailed link, so this
is a regression, and it means every cancellation is a phone call or an email to the box office.

(`POST /api/bookings/:id/cancel` does let the *owner or token holder* cancel; what is missing is the
staff-facing reservation route treating a customer-initiated cancellation as such.)

### No shared types

There is no central types module. Divergent `Reservation`/`Booking` interfaces are declared across
`admin/reservations.vue`, `box-office/reservations.vue`, `CollectModal.vue`,
`ReservationEditModal.vue`, `whats-on/[slug]/booking/[id].vue`, `bookings/my.get.ts` and
`bookings/index.post.ts`. Server responses are cast with `as` rather than inferred.

This is the largest ongoing maintainability tax in the codebase: a schema change does not produce a
type error anywhere it should. It bit during the August review: adding `refundedAt` to the customer
booking shape required editing four unrelated component interfaces by hand, and missing one would
have been a silent money bug rather than a compile error.

**Fix:** derive types from the Drizzle schema (`InferSelectModel`) into `shared/types/`, and stop
casting.

**Partly done.** `shared/types/` now exists and holds `pagination.ts` (the `Paginated<T>` envelope,
which `admin/users.vue` had hand-copied) and `shows.ts` (the show and performance shapes, which the
shows page and four of its modals each declared separately). The reservation family is untouched and
is the bigger half.

One correction to the fix as written: **do not derive the wire types with `InferSelectModel`.** The
Drizzle model describes the *table*, and the API is not the table: `performances.startsAt` is a
`Date` in the model and an ISO string in the response, and the rows carry computed fields
(`ticketsSold`, `performanceCount`, the run window) that no column corresponds to. Deriving from the
schema would describe something the client never receives. `shared/types/shows.ts` is hand-written
for that reason, and says so.

### No tests

CI now runs build, typecheck and lint, but there is no test framework and no `tests/`.

**Minimum worth having:** integration tests for the handlers that touch money: `POST /api/bookings`,
`PUT /api/reservations/:id/tickets`, `POST /api/reservations/:id/refund`, and unit tests for
`canRedeem`, `countOccupiedSeats` and `validityWindow`, all of which encode rules that were wrong in
ways no type checker would have caught.

---

### The dev server loses its D1 binding after a hot reload {#dev-d1-binding}

**Local development only. Production is unaffected.**

After editing a `server/` file, the next request sometimes fails with `[nuxt-hub] DB binding not
found` and a stack ending in `getDb`. Every subsequent request fails the same way until the dev
server is restarted; the database file itself is fine.

It comes from NuxtHub re-creating the Nitro handler without re-binding the local D1 proxy, so it is
not something this repo can fix from application code. The workaround is to restart `bun run dev`.

Worth knowing because the failure looks alarming: a 500 from every endpoint that touches the
database, immediately after a change that was probably unrelated. Check for this before assuming a
migration or a query broke.

## Suggested order

1. **#20a**: tests for the money handlers, before the structural work below.
2. **#16**: shared types. Everything else is safer afterwards.
3. **#9, #10a**: transactionality and the capacity race, together.
4. **#13, #14**: the two workflow gaps, whenever the box office next complains.

### Tab sales and tab cash split across a term boundary {#tab-accrual-split}

**P3 · Won't fix.** A tab charged in one term and settled in the next is in the first term's
sales figures and the second term's SumUp totals. That is inherent in selling on credit, not a
bug: the reconciling figure is the outstanding balance, which `/admin/bar/tabs` reports. The
Treasurer needs that number at both ends of a term. Recorded here so nobody spends an afternoon
hunting a discrepancy that is the design working.

## Show night UI review, 2026-08-24 {#ui-review-2026-08}

A review of the `/foh` surfaces, run by loading the real pages in a browser rather than reading
the code. Everything below was reproduced against a running app and is **unfixed**; what was fixed
at the time is not listed. Severity uses this file's scale.

The recurring shape is worth naming once: a `useAsyncData` call whose `error` is never
destructured renders a failure as a convincing empty state. On a show night that reads as
"nothing to do" rather than "this did not load".

### A failed Challenge 25 fetch renders as a genuine, empty register {#ui-01}

**P1 · `proscenium/app/pages/foh/age-checks.vue:50`**

A bar staffer opens /foh/age-checks on a show night when the fetch fails (in practice mode it always 404s, per the finding above; a 403 or a network blip does the same in live mode). `useAsyncData` puts the failure in an `error` ref that the page never reads, and `register` falls back to `{ night: '', accepted: 0, refused: 0, entries: [] }`. The screen renders "0" IDs accepted, "0" refusals tonight and "No refusals logged tonight." with no error, no retry and no pending state anywhere. That is a legal-compliance register confidently displaying fabricated zeros over a fetch that never succeeded, and staff have no way to tell the difference between a quiet night and a broken screen. Tapping the accept counter then POSTs, fails, and toasts "That was not recorded" with an undefined description while the counter stays at 0.

*Should:* Destructure `error` (and `status`) from the `useAsyncData` call and render a loud failure state instead of the register when the fetch failed, so the zeros are never shown as if they were real. The counters must not be rendered from a fallback that is indistinguishable from real data.

### "Scan a QR code" can never open the camera: the app's own Permissions-Policy blocks it {#ui-02}

**P1 · `proscenium/app/pages/foh/scan.vue:110`**

Door staff on a phone at the door tap the big "Scan a QR code" button. getUserMedia is rejected immediately on every device and browser, the camera never opens, and the page falls back to the amber line "No camera available. Type the reference instead." The QR scanner, which is the whole point of the page, is dead everywhere rather than only on unsupported devices.

*Should:* The rear camera should open and the jsQR/BarcodeDetector loop should read the ticket.

### Correcting a refusal counts it twice and leaves the wrong entry looking current {#ui-03}

**P2 · `proscenium/app/pages/foh/age-checks.vue:136`**

Bar staff log a refusal, notice a mistake, tap "Correct this" on that entry and log the corrected version. The "Refusals tonight" counter (line 136) goes from 1 to 2 for a single incident. The server counts every REFUSED row, superseded ones included (server/api/foh/age-checks/index.get.ts:35 refused: rows.filter(r => r.outcome === 'REFUSED').length), and the correction is inserted as a new REFUSED row with supersedesId set while the original is left untouched. The list below (lines 214-251) then shows both entries with identical styling; only the NEW one carries "corrects an earlier entry" (line 242), and the superseded one still offers its own "Correct this" button, so nothing on screen says which entry is the live one. Challenge 25 is a licensing register, and the accepted-to-refused ratio is the evidence the policy is operated, so the visible counter is now wrong.

*Should:* A superseded refusal should not be counted in "Refusals tonight", and the entry it replaced should be visibly struck through or badged "superseded" with its "Correct this" button removed.

### "Correct this" appears to do nothing, and opens a blank form when found {#ui-04}

**P2 · `proscenium/app/pages/foh/age-checks.vue:247`**

On a phone, a bar volunteer scrolls down the night's refusals and taps "Correct this" under the third or fourth entry. Nothing visibly changes at the tap point. The form is inserted far above, off-screen, replacing the "Log a refusal" button, and the entry list just shifts down under the user's thumb. If they scroll up and find it, the fields are empty and the reason has defaulted to "Looked under 25, no ID" rather than showing what the entry being corrected actually said, so a correction silently rewrites the reason.

*Should:* Tapping "Correct this" should bring the form into view and prefill it from the entry being superseded.

### Cancelling a refusal keeps the text, so the next refusal is pre-filled with the last person's description {#ui-05}

**P2 · `proscenium/app/pages/foh/age-checks.vue:205`**

Tap "Log a refusal", type "tall, grey coat" into Description and a note, then tap Cancel because the customer produced ID after all. Later in the evening tap "Log a refusal" for a different customer and tap "Log it". Cancel only sets `showForm = false` and `correcting = null`; `form.productDescription`, `form.description` and `form.notes` are cleared only after a successful REFUSED post (lines 83-87). The form reopens carrying the previous customer's description, and unless the operator notices, the Challenge 25 register, which is the evidence that the policy is operated, records a refusal described as somebody who was never refused.

*Should:* Cancel should reset the form fields, exactly as a successful submission does.

### A failed call to backstage is completely silent {#ui-06}

**P2 · `proscenium/app/pages/foh/backstage.vue:78`**

On a show night the duty manager taps a preset such as "House open", or types a message and taps "Send". call() (lines 73-85) has a try/finally with no catch and no toast. If the POST fails (403, no backstage session, a dropped connection in the foyer) the exception is unhandled: the button un-greys, the text box keeps its content, loadBoard() at line 80 never runs, and nothing appears in "Last call", in the message list, or as an error. The screen after a failed call is identical to the screen before it, so the duty manager believes the call went out. acknowledge() (lines 87-90) has the same shape with no try at all: tapping the big green "Tap to acknowledge" banner on a failure leaves the banner exactly where it was with no explanation, and the button has no loading state so it invites repeated taps.

*Should:* A failed call or acknowledgement should toast an error (the page already has useToast, used by reset() at line 119) and leave the typed message in place; a successful one should show the call in the list. Both buttons should show a busy state while in flight.

### An incoming call from backstage is inserted silently, with no live region {#ui-07}

**P2 · `proscenium/app/pages/foh/backstage.vue:168`**

The duty manager keeps the Backstage page open on the FOH desk. The stage manager sends "Clearance please" from the backstage board. loadBoard() polls every 2.5 seconds (line 94) and pushes the message into `unacked`, which renders the large green "Tap to acknowledge" button. Nothing on that button or any ancestor is aria-live or role="alert", there is no sound and no document-title change, so the arrival is announced to nobody. A duty manager using a screen reader, or simply not looking at the phone, has no way to know a call has landed until they re-read the page.

*Should:* The unacknowledged-calls container should be aria-live="assertive" (role="alert"), so a new call from backstage is announced the moment it is polled in.

### Backstage renders as a completely blank screen when its fetch fails {#ui-08}

**P2 · `proscenium/app/pages/foh/backstage.vue:142`**

Open Backstage while any practice run is open (or any time /api/foh/backstage fails). I loaded /foh/backstage as the dev front-of-house user with a bar-till run active: the endpoint returns 409 "That is real data, and you are in practice mode." and the rendered page body is nothing but "Backstage" and "Back". `useAsyncData` at line 23 has no catch and no error branch, and the entire page sits behind `v-if="data"`, so the duty manager gets no code, no QR, no device list, no reset button and no explanation on a black screen.

*Should:* Show why the page is empty and offer a retry. The sibling board fetch on line 48 already guards itself with `.catch(() => null)`; the main one does not.

### "Edit on desk" throws the bar staff off the till onto the public homepage and loses the basket {#ui-09}

**P2 · `proscenium/app/pages/foh/bar/till.vue:632`**

On the Tickets tab a bar volunteer searches for a booking and taps "Edit on desk" on a result. The link goes to /admin/box-office/reservations, which a proscenium:FRONT_OF_HOUSE session may not open: it 302s to /. The user lands on the public homepage with no message, and the basket they had built on the till is gone. Verified live: `curl -b <front-of-house session> /admin/box-office/reservations` -> 302 to http://localhost:3001/, while the same session opens /foh/bar/till fine (200). The link is also rendered during a practice run, so a trainee following it is silently taken from a sandbox to the real reservations desk.

*Should:* Only render this link for a session that can actually reach the desk (the same check the desk's own guard uses), and hide it entirely while training.active. If it stays, it must not discard the basket.

### Till booking search has no error handling and no "nothing found" state {#ui-10}

**P2 · `proscenium/app/pages/foh/bar/till.vue:268`**

On the Tickets tab, a staffer types a booking reference or a name and taps "Find". `search()` has a `finally` that stops the spinner but no `catch` at all, so a failed lookup (guaranteed in practice mode by the 404 above, or any 403/500 live) becomes an unhandled rejection: `results` keeps its previous contents, the spinner flicks off, and nothing is displayed. Separately, when the lookup succeeds but matches nothing, `results` is set to `[]` and the template has no empty-state branch, so again the screen is unchanged. Both cases are indistinguishable from a broken button, at the counter, with a customer waiting. The sibling screen scan.vue:69-77 handles exactly this correctly with a `problem` ref covering both the failure and the no-results case.

*Should:* Add a `problem` ref like scan.vue's: catch the failure and show "That lookup failed, try the booking reference", and when the result set is empty show "Nothing matching …". Clear it at the start of each new search.

### A failed till load renders as a working till with an empty menu and no message {#ui-11}

**P2 · `proscenium/app/pages/foh/bar/till.vue:57`**

A bar staffer opens the till when /api/bar/tonight fails (always, in practice mode, per finding 1; also on any 403 or outage). The `useAsyncData` error is never destructured or rendered, and `tonight` collapses to `null`. The product grid renders zero buttons, the total reads £0.00, the basket says "Nothing in the basket." and the Card button sits there disabled. Worse, the one prompt that would hint something is wrong is itself gated on `tonight` being truthy (`v-if="!training.active.value && tonight && !tonight.session"`), so the "The bar is not open yet" alert disappears too. The staffer sees a till that looks loaded and simply has nothing to sell, with no error, no pending indicator and no retry. Confirmed by a live render of the page in practice mode.

*Should:* Destructure `error`/`status` from the `useAsyncData` call, show a pending state while it loads, and on failure replace the product grid with a clear failure message and a retry, rather than an empty menu that reads as valid data.

### Closing the bar flips the till back to "The bar is not open yet" {#ui-12}

**P2 · `proscenium/app/pages/foh/bar/till.vue:468`**

At the end of the night the bar staff type a closing note and tap "Close the bar". closeBar() succeeds, calls refresh() (line 468) and toasts "Bar closed". /api/bar/tonight only returns a session with closedAt IS NULL (server/api/bar/tonight.get.ts:14), so after the refresh tonight.session is null. The closing-note row (lines 516-532) disappears and the warning alert at line 499 reappears: "The bar is not open yet -- Opening it groups tonight's takings into one session for the close", with an "Open the bar" button. The success toast fades in a few seconds and the screen is then indistinguishable from a bar that was never opened, so the close reads as if it failed or undid itself. One more tap on "Open the bar" silently opens a second bar session for the same night, splitting the takings across two closes.

*Should:* After a successful close the till should show a closed state ("Bar closed at 23:14 by ...") that persists, and the "Open the bar" prompt should not reappear for a night that has already been closed, or should at least warn that it is reopening a closed bar.

### Comp cards cover the SumUp total and the Card button on a phone {#ui-13}

**P2 · `proscenium/app/pages/foh/bar/till.vue:799`**

A bartender on a phone taps "Comp", or a duty manager working the bar has a comp waiting for approval, then tries to ring up the next customer. A fixed card pinned 16px from the bottom of the viewport paints over the fixed basket bar, hiding the "Type into SumUp" figure and the Card/Tab/Comp buttons. The requester's card stays for the full ten-minute expiry (or until they find the xs "Clear" button), and the approver's queue stays until every request is answered. The till cannot be used in the meantime.

*Should:* The pay bar and its total must stay visible and tappable at all times; the comp cards should sit above it in flow, or offset by the pay bar's height.

### Basket remove control is a bare minus glyph with no accessible name and a sub-24px target {#ui-14}

**P2 · `proscenium/app/pages/foh/bar/till.vue:660`**

A bar server rings up the wrong drink and taps the small grey minus to the left of the basket line to take it off. The only decrement/remove control on the till is <button type="button" class="mr-2 text-neutral-500">−</button>. Its accessible name is the U+2212 glyph alone, announced as "minus, button", and every basket line renders an identical one with nothing tying it to a product, so a screen-reader user cannot tell which line they are about to remove. It also has no padding, so on a phone the hit area is roughly the glyph box, well under the 24x24 CSS px minimum, next to a busy fixed footer.

*Should:* Give it :aria-label="`Remove one ${lineLabel(line)}`" and real padding (a p-2 min-w-11 min-h-11 tap target), the same way every other action on this page is labelled.

### Every till action is silent: basket and SumUp total change in no live region and raise no toast {#ui-15}

**P2 · `proscenium/app/pages/foh/bar/till.vue:643`**

A bar server taps a product tile, picks a discount, or clears a line, then reads the amount to type into SumUp. addProduct (line 572), the discount buttons (lines 685/693) and removeProduct all mutate the fixed basket panel and the £ figure at line 718 with no toast, no focus move and no live region. The served page contains zero aria-live and zero role="status" attributes, so a non-visual user gets no confirmation that a tap registered and no readout of the total they are about to charge. Every other outcome on this page (card taken, tab charged, comp sent) does get a toast, so the basket is the one silent surface.

*Should:* Wrap the basket list and the total in role="status" aria-live="polite", so adding, removing or discounting announces the new total.

### "Open the bar" fails in complete silence and can be double-fired {#ui-16}

**P2 · `proscenium/app/pages/foh/bar/till.vue:443`**

On the till, the "The bar is not open yet" alert is showing and the user taps "Open the bar" (button at line 508). openBar() has no try/catch, does not set busy, and the button carries neither :loading nor :disabled. requireBarScope() in server/api/bar/sessions/index.post.ts:16 throws for anyone not scoped to a bar night, so a refusal becomes an unhandled promise rejection: no toast, no inline error, the alert stays exactly as it was. The user cannot tell the tap registered. Every other action on this page (closeBar, takeCard, chargeToTab, settleTab, requestComp, decideComp) toasts on failure. The live button also allows a second tap while the first request is in flight.

*Should:* Wrap in try/catch with the same 'Not opened' toast the peers use, set busy, and bind :loading="busy" so the button reports both progress and failure.

### Em dash in the till's alcohol-training warning, plus "the DM" jargon {#ui-17}

**P2 · `proscenium/app/pages/foh/bar/till.vue:713`**

A bar volunteer who is not recorded as alcohol-trained adds an age-restricted drink to the basket; the amber warning appears above the SumUp total. It reads "You're not recorded as trained to sell alcohol , ask the DM." The `&mdash;` entity is decoded by the Vue template compiler into a real U+2014 em dash: confirmed in the shipped build output (node_modules/.cache/nuxt/.nuxt/prerender/chunks/build/till-BaoUjwGY.mjs contains bytes E2 80 94 in that string). CLAUDE.md makes "No em dashes" a hard rule that applies to UI copy. The same defect appears a second time at tonight.vue:181, `>&mdash; auto-closed, no duty manager sign-off</span>`, in the "Night closed" panel. Separately, "the DM" is an unexplained abbreviation on the one screen most likely to be a volunteer's first shift; the rest of this very file spells it out as "the duty manager" (till.vue:803, :815, :915, :946).

*Should:* "You're not recorded as trained to sell alcohol. Ask the duty manager." Replace both `&mdash;` occurrences with a comma, a colon or a full stop.

### "Open the bar" is a dead button: no spinner, no error, and the server's message is discarded {#ui-18}

**P2 · `proscenium/app/pages/foh/bar/till.vue:443`**

A bar staffer opens the till, sees the "The bar is not open yet" alert, and clicks its "Open the bar" action. `openBar()` has no try/catch, never sets `busy`, and the button carries no `:loading`. Verified live: `POST /api/bar/sessions` returns 403 with the perfectly readable message "The till is for whoever is on the bar tonight." for an ordinary front-of-house user. The rejection escapes into an unhandled promise, `refresh()` never runs, and the screen is byte-for-byte unchanged. The user sees absolutely nothing happen and the alert telling them to open the bar stays up, so they click again. Every other mutation on this page (closeBar, takeCard, chargeToTab, settleTab, requestComp, decideComp) wraps itself in try/catch/finally with a toast; this one is the only one that does not.

*Should:* Match its siblings: set `busy` in a try/finally, bind `:loading="busy"` on the button, and toast the failure with `error.data?.statusMessage`, which the server already supplies.

### A booking added to the till basket cannot be taken out again {#ui-19}

**P2 · `proscenium/app/pages/foh/bar/till.vue:647`**

On the Tickets tab, search a surname that matches two bookings, tap "Add £12.00" on the wrong one, then try to remove it. There is no control to remove it. `addReservation` (line 279) pushes into `basketTickets` and clears both the results list and the search term, and nothing else ever pops that array except a completed card sale (line 426). The ticket lines render as plain `<p>` elements, while the bar lines beside them get a "−" button (lines 660-664). The figure shown under "Type into SumUp" is now wrong and the only escape is reloading the page, which also throws away the bar basket.

*Should:* Each ticket line needs a remove control like the bar lines have, so a mis-tap can be undone without losing the rest of the transaction.

### "Correct this" appears to do nothing: it activates a form that is off-screen above, with no focus move {#ui-20}

**P2 · `proscenium/app/pages/foh/contacts.vue:204`**

On a busy night the FOH lead scrolls down the incident log, finds an entry that needs correcting, and taps "Correct this" under it. The handler only sets `correcting = entry`. The banner it reveals (line 159) and the compose textarea it targets (line 177) are both rendered above the entire entry list, so with more than two or three entries logged they are off-screen. Nothing scrolls, nothing takes focus, and the tapped area does not change. From the user's point of view the button is dead. For a keyboard or screen-reader user this is also a focus-order break: focus stays on a button whose effect is 40 lines earlier in the DOM. The identical pattern exists in proscenium/app/pages/foh/age-checks.vue:247, where "Correct this" opens the refusal form at line 154, above the refusals list.

*Should:* Setting `correcting` should move focus to the textarea (a template ref plus .focus(), which also scrolls it into view), so the correction flow visibly begins where the user is looking.

### "Add to the log" and backstage "Send" do nothing at all when the field is empty, with no error and no disabled state {#ui-21}

**P2 · `proscenium/app/pages/foh/contacts.vue:53`**

On Contacts & incidents a duty manager taps the large full-width "Add to the log" button before typing anything (or after the textarea has been cleared by a mistap). Same on Backstage with "Send". Nothing. addEntry() opens with `if (!performance.value || !draft.value.trim()) return`, so the handler returns before any request; the button is not disabled, shows no loading state, and no toast or inline message appears. The identical pattern is at backstage.vue:75 (`if (!presetId && !body) return`) behind the "Send" button. On a multi-performance night the `!performance.value` half of that guard also fires with a full textarea, so a typed incident entry is swallowed too. This is a control that a user will tap repeatedly believing the app has frozen.

*Should:* Disable the button while the field is empty (`:disabled="!draft.trim()"`), or surface why nothing happened. The `!performance.value` case must say which performance is missing rather than discarding a typed entry.

### On a two-show night the "Which are you working?" picker changes nothing except a summary card {#ui-22}

**P2 · `proscenium/app/pages/foh/index.vue:236`**

On a night with more than one performance, a staff member taps their show in the "More than one show tonight. Which are you working?" list, then taps a tile such as Tonight at a glance, Contacts & incidents or Emergency. The tap highlights the row and updates the summary card, and that is all it does. `buttons` (line 59) filters ALL_TILES by `rolesTonight`, which is built from every performance tonight (line 52), not from `selected`; and each tile's link is the bare static path with no query (`:to="button.to ?? undefined"`, line 236). So the destination page runs useFohTonight, finds no `?performance=` in the URL and more than one performance, and asks "Which performance?" all over again. The choice the user just made is discarded. Challenge 25 is worse: age-checks.vue has no picker at all, so `performanceId: performance.value?.id` (age-checks.vue:70) is undefined and every ID check that night is filed against no performance.

*Should:* Carry the selection through: link each tile to `{ path: button.to, query: { performance: selectedId } }` when one is chosen, and scope the tile role filter to the selected performance rather than to every shift held tonight.

### The performance picked on the FOH home is discarded by every tile {#ui-23}

**P2 · `proscenium/app/pages/foh/index.vue:236`**

Two performances tonight. On the FOH home the user taps the show they are working, then taps "Tonight at a glance", "Challenge 25" or "Scan ticket". selectedId (line 26) is a page-local ref and the tiles link to bare paths: :to="button.to ?? undefined" carries no ?performance= query. useFohTonight() on each sub-page derives performance from route.query.performance and returns null when there is more than one performance and no query. So the choice only ever changes the summary card on the home screen. /foh/tonight, /foh/contacts and /foh/emergency re-ask "Which performance?"; /foh/tonight additionally hides "Close the night" (tonight.vue:193 requires performance). /foh/age-checks and /foh/scan have no picker at all, so age-checks.vue:70 posts performanceId: undefined and the ID check is filed against no performance (server/api/foh/age-checks/index.post.ts:43 stores null).

*Should:* Each tile should carry the selected performance, e.g. :to="{ path: button.to, query: selectedId ? { performance: selectedId } : undefined }", so one choice on the home screen scopes the whole shift.

### Practice ending or failing throws the user back to the FOH home with no message at all; the explanation is composed and discarded {#ui-24}

**P2 · `proscenium/app/pages/foh/index.vue:128`**

A trainee is mid-basket on the practice till (or the practice door/Challenge 25) when the practice window expires, or taps a "Practise the till" tile whose sandbox the server refuses. They are silently navigated to /foh. Nothing on the FOH home says practice ended, or why. `useTrainingMode.leaveWhenPracticeEnds` (composables/useTrainingMode.ts:121) navigates to `/foh?practice=ended`, and `enter()` (:106) navigates to `/foh?practice=unavailable&reason=<message>` after deliberately extracting the server's refusal message. foh/index.vue never calls `useRoute()` and never reads `route.query` anywhere in its 274 lines, so both query strings are inert: the `reason` text is built purely to be shown and is then thrown away. From the trainee's side a screen full of work vanishes for no stated reason, which is exactly the state the loud practice banner exists to prevent.

*Should:* foh/index.vue should read `route.query.practice` and render an alert: "Practice has ended. Nothing you did was real." for `ended`, and the passed `reason` for `unavailable`.

### Front of House ignores ?practice=unavailable and ?practice=ended, so a bounced practice tile looks like a tile that did nothing {#ui-25}

**P2 · `proscenium/app/pages/foh/index.vue:128`**

A trainee taps a Practice tile whose window has just closed, or taps "End practice" in the banner. They are redirected to /foh and shown the ordinary Front of House home with no message. useTrainingMode redirects to `/foh?practice=unavailable&reason=<the server's explanation>` (line 106) and to `/foh?practice=ended` (line 121), but foh/index.vue never reads `route.query.practice`, so both the reason and the confirmation are silently discarded. The trainee's reading is that the tile is broken.

*Should:* /foh should render the reason when `practice=unavailable` ("Practice is only open while you are being taught this. Ask whoever is teaching you.") and a short confirmation when `practice=ended`, so the redirect explains itself.

### A failed lookup leaves the previous party's PAID verdict on screen {#ui-26}

**P2 · `proscenium/app/pages/foh/scan.vue:76`**

On the door, look up booking A (big green "PAID: all collected, 4 people"), then type the next party's reference and press Find while the lookup fails (a blip, or the 409 an open practice run causes). The catch sets `problem` to a one-line grey message but never touches `results`, so booking A's full-width verdict panel stays on screen directly underneath it. The door reads the biggest thing on the page and admits the wrong party under someone else's booking.

*Should:* A failed lookup must clear (or visibly invalidate) the previous result, so no verdict is ever shown that does not belong to the reference just entered.

### Tonight tells the duty manager that closing the night is not built yet, directly below the working "Close the night" button {#ui-27}

**P2 · `proscenium/app/pages/foh/tonight.vue:386`**

A duty manager finishes the show, opens Tonight at a glance, and scrolls to the bottom of the page. The footer reads "Pass pressure, access needs and closing the night arrive with their own builds." Both named features are already built and rendered on that same page: the "Close the night" button is at lines 192-201 with its confirmation modal at 391+ and a working `closeNight()` POST at line 75, and the "Access tonight" section is at lines 282-296 fed by `/api/foh/access-tonight` (line 127). A duty manager who reads the footer concludes the sign-off does not exist yet and leaves the night unclosed. The till page states the cost of that: "Until this runs, every end-of-night report calls the bar unclosed" (bar/till.vue:455).

*Should:* Delete the stale footer, or reduce it to the one thing genuinely outstanding (pass pressure). Copy must never tell a user a control on the same screen does not exist.

### Access-needs list is keyed by first name, so two bookers with the same name collide {#ui-28}

**P2 · `proscenium/app/pages/foh/tonight.vue:293`**

Two parties tonight have consented access needs and both bookers are called Alex. The duty manager opens "Tonight at a glance". v-for="entry in access" :key="entry.firstName" gives both rows the same key. Vue logs a duplicate-key warning and reuses the first matching node, so on any re-render of the list (the page refetches whenever performance changes, tonight.vue:127-133) the needs badges and the fohNote can be shown against the wrong party, or one party disappears entirely. This is consented access data being mis-attributed on the screen door staff act on.

*Should:* Key on something unique. The endpoint returns no id, so key on the array index, or add a stable id to /api/foh/access-tonight and key on that.

### Em dashes in FOH copy, against the estate-wide hard rule {#ui-29}

**P3 · `proscenium/app/pages/foh/bar/till.vue:713`**

A volunteer not recorded as alcohol-trained puts an age-restricted product in the basket; a duty manager opens Tonight at a glance after an auto-closed night. The warning reads "You&rsquo;re not recorded as trained to sell alcohol &mdash; ask the DM." and the closed-night line reads "Night closed &mdash; auto-closed, no duty manager sign-off". Both render a literal em dash on screen, which the estate CLAUDE.md forbids as a hard rule in prose and UI copy alike. Related stale copy on the same page: tonight.vue:386 still tells the reader "Pass pressure, access needs and closing the night arrive with their own builds" while the access needs section and the "Close the night" button are both on the screen above it.

*Should:* Use a comma, colon or two sentences: "You're not recorded as trained to sell alcohol. Ask the DM." and "Night closed, auto-closed, no duty manager sign-off". Delete the tonight.vue:386 line, which now contradicts the page it sits on.

### Em dashes in FOH copy, against the house rule {#ui-30}

**P3 · `proscenium/app/pages/foh/bar/till.vue:713`**

Bar staff add an age-restricted product while not recorded as alcohol-trained; a duty manager views an auto-closed night. till.vue:713 renders "You're not recorded as trained to sell alcohol &mdash; ask the DM." and tonight.vue:181 renders "&mdash; auto-closed, no duty manager sign-off". Both output a literal em dash in user-facing copy, which the estate conventions forbid outright ("No em dashes. Use a comma, a colon, a semicolon, parentheses, or two sentences. This is a hard rule and applies to prose and UI copy as much as to code."). Writing it as an HTML entity does not change what the reader sees.

*Should:* Replace with a comma, colon or two sentences, for example "You're not recorded as trained to sell alcohol. Ask the DM." and "auto-closed, no duty manager sign-off".

### Em dashes in user-facing FOH copy {#ui-31}

**P3 · `proscenium/app/pages/foh/bar/till.vue:713`**

A bartender who is not recorded as alcohol-trained puts an age-restricted item in the basket; or anyone opens Tonight after the night auto-closed. The warning reads "You're not recorded as trained to sell alcohol , ask the DM." and the closed-night line reads "Night closed , auto-closed, no duty manager sign-off".

*Should:* House style forbids em dashes in code and copy alike; use a colon, a comma or two sentences.

### Em dashes rendered in FOH copy {#ui-32}

**P3 · `proscenium/app/pages/foh/bar/till.vue:713`**

A bar volunteer not recorded as alcohol-trained puts an age-restricted product in the basket; a duty manager opens a night that auto-closed. The warning renders "You're not recorded as trained to sell alcohol , ask the DM." and tonight.vue:181 renders "Night closed , auto-closed, no duty manager sign-off". Both are &mdash; entities, which the browser paints as literal em dashes in user-facing copy. The estate rule in CLAUDE.md is a hard no on em dashes in prose and UI copy alike.

*Should:* Use a comma, a colon or two sentences: "You're not recorded as trained to sell alcohol. Ask the DM." and "Night closed: auto-closed, no duty manager sign-off."

### Em dashes in FOH copy, against the estate hard rule {#ui-33}

**P3 · `proscenium/app/pages/foh/bar/till.vue:713`**

A bar volunteer who is not recorded as alcohol-trained puts an age-restricted item in the basket, or anyone opens /foh/tonight after an auto-closed night. The warning reads "You're not recorded as trained to sell alcohol &mdash; ask the DM." and tonight.vue line 181 reads "&mdash; auto-closed, no duty manager sign-off". Both render a literal em dash in user-facing copy.

*Should:* No em dashes anywhere, in code or copy (estate CLAUDE.md, hard rule). Use a colon, a comma or two sentences: "You're not recorded as trained to sell alcohol. Ask the DM."

### Performance picker shows the current choice only as a border colour, with no aria-pressed or aria-current {#ui-34}

**P3 · `proscenium/app/pages/foh/index.vue:184`**

On a double-bill night, FOH staff pick which performance they are working before opening Tonight at a glance, Contacts or Emergency. The chosen performance is indicated solely by :class swapping border-violet-500 bg-violet-950/40 for border-neutral-800 (lines 189-191). There is no aria-pressed, no aria-current, no tick and no text difference, so the selection is carried by colour alone. A screen-reader user hears two identical buttons and cannot tell which is active; in a dark foyer on a dimmed phone the violet-vs-neutral border is easy to miss. This choice then scopes every other FOH screen, so getting it wrong sends the door to the wrong show's access notes.

*Should:* Add :aria-pressed="performance.id === selectedId" (or make it a radiogroup) and a non-colour cue such as a tick or a "Selected" label.

### The page says two features "arrive with their own builds" while showing both {#ui-35}

**P3 · `proscenium/app/pages/foh/tonight.vue:386`**

A duty manager opens "Tonight at a glance" and scrolls to the bottom. Line 386 reads "Pass pressure, access needs and closing the night arrive with their own builds." Both named features are already on that page: the "Close the night" button renders at line 192 for a duty manager, and the "Access tonight" panel renders at lines 281-324 whenever there are consented needs. Staff read the footer as authoritative and conclude the close-the-night button they can see is a placeholder, or that the access panel they just read is not the real list.

*Should:* The footer should name only what is genuinely still to come, or be removed now that closing the night and access needs are shipped.

### Tonight and Contacts render an empty page when no performance is in scope {#ui-36}

**P3 · `proscenium/app/pages/foh/tonight.vue:234`**

Open /foh/tonight (from a bookmark, browser Back, or a tab left open from an earlier night) on a night you are not rostered on, or when nothing is scheduled. `performance` is null and `performances.length` is 0, so neither the "Which performance?" branch (line 218) nor the content branch (line 234) renders. Loaded live, the whole body is "Tonight at a glance" and "Back". /foh/contacts behaves identically at line 109. The user cannot tell whether the app is broken, the show is cancelled, or they are simply not on.

*Should:* Both pages need the empty state the FOH home already writes ("You're not on tonight", or "There are no performances scheduled tonight"), the way the emergency page falls back to a sentence rather than nothing.

### Em dash in the auto-closed notice on Tonight {#ui-37}

**P3 · `proscenium/app/pages/foh/tonight.vue:181`**

Open Tonight at a glance the morning after a night that was auto-closed rather than signed off. The page renders "Night closed , auto-closed, no duty manager sign-off" from a hard-coded `&mdash;`. The estate rule forbids em dashes in prose and UI copy without exception.

*Should:* Use a colon, comma or two sentences, for example "Night closed: auto-closed, no duty manager sign-off".
