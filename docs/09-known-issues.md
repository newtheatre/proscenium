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
| 24 | [An approved comp can be left with no transaction](#comp-claim-window) | P3 | Small |

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
| 26 | Migration `0047` deleted every `bar_prices` row: a generated table rebuild cascades under D1, where `PRAGMA foreign_keys=OFF` is a no-op inside a transaction | `bun run check:migrations` refuses a generated rebuild of any table something cascades onto (ADR-0037). The four lost rows were not recovered; the catalogue was re-seeded the same day |
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

### Thirteen dependency advisories need major upgrades {#audit-remaining-2026-08}

**P2 · dependencies.** `bun audit` went from 90 findings to 13 on 2026-08-24. What is left needs a
major version bump of a declared dependency, so none of it is drive-by work.

| Package | Reached through | Why it is still here |
| --- | --- | --- |
| `nuxt-og-image` (3 moderate) | `@nuxtjs/seo` | Reflected XSS via a query parameter, SSRF, and unbounded image dimensions. Fixed in 6.2.5. This repo pins `@nuxtjs/seo` at 3.4.0 and the fix landed in its 5.x line. **This is the one to do first: it is reachable on a public site.** |
| `unhead` (2 moderate, 1 low) | `nuxt` | `useHeadSafe` protocol bypasses. Moves with the Nuxt version. |
| `image-size`, `sharp` (3 high) | `@nuxt/image` | Parser denial of service and inherited libvips issues. Both run at build time here, not in the Worker. |
| `ws` (1 high, 1 moderate) | dev tooling | Memory exhaustion and uninitialised memory disclosure. Not in the production bundle. |
| `esbuild` (1 moderate, 1 low) | `vite` | Dev-server only, and no version in range fixes it. |

Read the reachability column before ranking these by severity alone. The two `high` entries against
`image-size` are a build-time parser, while the `moderate` XSS in Nuxt OG Image is a live endpoint
on `newtheatre.org.uk`.

### An approved comp can be left with no transaction {#comp-claim-window}

**P3 · `server/api/bar/comps/[id]/approve.post.ts`.** Approval claims the decision in its own
statement, re-asserting `status = 'PENDING'` in the `WHERE`, and only then batches the transaction,
the stock movements and the `transaction_id` back onto the request. That is what stops two approvers
writing two COMP transactions and depleting stock twice; a predicate inside the batch would not,
because D1 does not abort a batch on rows affected.

The cost is a window between the two writes. If the Worker dies or D1 refuses the batch in between,
the request is `APPROVED` with a null `transaction_id`: the give-away shows in `compsIn` and not in
the ledger. That is visible at reconciliation and correctable by hand, where a doubled stock ledger
is neither: `stock_movements` is append-only, so a duplicate can only be offset, never removed.

Closing it needs the decision and the transaction in one atomic write, which the foreign key from
`comp_requests.transaction_id` to `transactions.id` forbids in a single batch statement order. It is
recorded rather than half-fixed.

### Two settles of one tab in the same instant both record the money {#tab-settle-race}

**P3 · `server/utils/barTabs.ts:198`.** A second settle of the same tab is already refused when it
arrives after the first: `settleTab` reads what is outstanding and throws 409 "There is nothing
outstanding on that tab" once the first has landed. That covers the double tap, which is the way
this actually happens.

What is not covered is two settles genuinely in flight together. Both read the same outstanding
total, both insert a settlement transaction, and only one of the two UPDATEs matches a row, because
that half is correctly scoped by predicate. The tab ends settled once, and the day's takings are
over by the tab's value.

Closing it needs the database to arbitrate, and D1 offers no way to abort a batch on rows affected.
The options are a deterministic settlement id so the second insert collides on the primary key, or
a partial unique index; both change the shape of `transactions`, so neither is a drive-by change.
Recorded rather than half-fixed, because a predicate on the UPDATE looks like a cure and is not.

**A different window, a charge landing mid-settle, is closed.** `taken_at` is stored to whole
seconds, so a charge the debtor posted from their phone after the read but inside the same second
used to satisfy `taken_at <= asOf` and be stamped settled against a settlement that never covered
it. The read now returns `max(rowid)` over the charges it summed and the `UPDATE` is bounded by
that rowid, so a charge committed since stays outstanding. Do not swap it back for a timestamp.

### A stocktake finished before 2026-08-25 may hold a count of zero that was meant to be blank {#stocktake-blank-as-zero}

**P2 · data.** The count page sent an emptied box as the string `''`, which `z.coerce.number()`
turned into `0`. A counter who mistyped a figure, cleared the box and saved therefore recorded the
line as counted zero rather than blank, and "Finish and apply" wrote a movement of minus the whole
on-hand for that product. The coercion is fixed: a blank box now clears the count, which is what the
page has always said it does.

Stocktakes already applied cannot be unwound, because the movement ledger is append-only. To find
them, look for `STOCKTAKE` movements that took a product from a plausible level to exactly zero on a
day nobody emptied the shelf; `/admin/bar/stocktakes` lists each take with the lines it moved. The
repair is an ordinary stock adjustment back to the real level, dated today, with a reason naming the
stocktake it corrects. Do not edit the historic movement.

### A tab charge voided twice before 2026-08-25 credited its stock back twice {#void-double-credit}

**P2 · data.** The void stamped the charge behind a predicate that could match only once, but wrote
the stock reversal unconditionally alongside it. Where the debtor and the bar manager voided the
same charge at once, or a settle landed first, a second full set of `VOID` movements was written:
`on_hand` reads a container heavy for every product on that charge, and the next stocktake books
the difference as shrinkage in the wrong direction. The reversal is now one guarded statement, so
no new pair can be written.

Pairs already in the ledger stay there, because it is append-only. To find them:

```sql
SELECT ref_id, product_id, count(*) AS void_rows, sum(qty) AS credited_back
FROM stock_movements
WHERE ref_table = 'transactions' AND kind = 'VOID'
GROUP BY ref_id, product_id
HAVING count(*) > 1;
```

One `VOID` row per product per voided charge is the correct shape, so every row this returns is a
duplicate. Check it against the charge's `SALE` rows for the same `ref_id`: the reversal should
cancel them exactly. The repair is an ordinary stock adjustment back to the real level, dated
today, with a reason naming the charge it corrects. Do not edit the historic movements.

### A merge before 2026-08-25 may have left a live customer on a placeholder address {#merge-placeholder-email}

**P2 · data.** When an account merge's winner had no mirror row here, one was created with
`merged-<id>@placeholder.invalid` and nothing ever replaced it. `GET /api/users` filters both its
listing and its exact-address lookup on `email NOT LIKE '%.invalid'`, so that customer is invisible to
the staff directory, to the box office walk-in lookup and to the rota picker, and is counted in the
"N anonymised not shown" total as though they had been erased. Booking confirmations for them go to
the unroutable placeholder. The merge itself now carries the losing account's real address onto the
winner in the same batch, so no new row can be minted this way.

Rows already in that state heal on their own the next time the person's session reaches this app,
because `ensureLocalUser` rewrites the mirror. Someone who never signs in stays hidden. To find them:
`select id, name, email from users where email like 'merged-%@placeholder.invalid'`. The repair is to
put the person's real name and address back on the row, which staff can do through
`POST /api/users` on the same address the customer books under.

### Emergency information does not survive a genuinely offline page load {#emergency-offline}

**P2 · `app/pages/backstage.vue`, `app/pages/foh/emergency.vue`.** Both pages now mirror their
payload to `localStorage` and render the saved copy when the fetch fails, which covers a dropped
request on a page that has already loaded. Neither survives opening the page with no signal at all,
because `localStorage` only helps once the Worker has served the HTML.

`docs/11` §2.5 asks for the emergency content to be cached in a service worker or inlined into the
shell, so the assembly point is reachable from a phone with one bar in the foyer. There is no service
worker and no PWA module in this app, so that is a piece of work in its own right rather than a
tweak to either page. Recorded so nobody assumes the cache already covers it.

### Migration 0052 put a depletion quantity into `container_ml` and the real size is gone {#bar-container-size-lost}

**P2 · `server/db/migrations/sqlite/0052_unstack_self_referencing_recipes.sql`.** 0050 turned every
`stock_product_id` pointer into a recipe row with `qty = coalesce(depletes_qty, 1)`, then nulled
`container_ml` for every product that gained one. 0052 unstacked the products that pointed at
themselves and restored `container_ml` from that recipe row's `qty`, on the stated but false premise
that 0050 had put the container size there. `qty` is a depletion quantity: a 70 cl spirits bottle
that stocked itself came out of 0052 holding 25, 35 or 1, not 700. 0051 dropped `depletes_qty` and
`stock_product_id`, so nothing left in the database holds the real size, and the migration file's
header now says so.

**What it does to the numbers.** `containerSize()` returns `container_ml ?? 1`, so a sale of that
product writes a movement of 1 ml per bottle instead of a measure, `containersToQty()` books a
delivery of twelve bottles as twelve millilitres, and `formatContainers()` reports the level as
thousands of bottles. Every figure derived from those movements, on-hand, par alerts, stock at cost
and the variance report, is in the wrong basis.

**Finding them.** There is no marker left on the row, so look for the shape:

```sql
SELECT id, name, unit, container_ml FROM bar_products
WHERE container_ml IS NOT NULL AND container_ml < 100 AND unit IN ('bottle', 'measure');
```

A bottle whose container is under 100 ml is a depletion quantity wearing the wrong hat. Cross-check
against the bar manager's own list of sizes, or a Time Travel restore point from before 0050, which
is the only place the pre-0050 value survives.

**Repair.** `container_ml` cannot be edited once movements exist:
`PATCH /api/admin/bar/products/:id` returns 409 "its size is fixed", and that is correct, because
every movement means what it means in the size that was current when it was written (ADR-0035). The
supported repair is to retire the product and add it again at the right size, then take a stocktake
against the new one. Do not edit the historic movements; the ledger is append-only.

### A price mistyped today cannot be corrected until tomorrow {#price-typo-same-day}

**P3 · `server/api/admin/bar/products/[id]/prices.post.ts`.** `bar_prices` holds one row per
product per date and the route is append only, so a second POST for a date already in the history
is refused with `409`. That is what stops a repeat POST rewriting what a price was and who set it,
which is the only price audit trail the system has. The cost is that the current price is the
latest row dated on or before today, so a figure keyed in wrongly this morning cannot be beaten by
another row today: dating one from tomorrow fixes tomorrow and leaves the bar on the wrong figure
tonight.

Until somebody needs it enough to build the alternative, the workarounds are both blunt: set the
product `HIDDEN` for the rest of the night and ring the drink up as another product, or retire it
and add it again at the right price, which is the same repair `container_ml` already uses. Both
keep the history honest.

Closing it properly means letting a date hold several rows and having the latest `created_at` win.
That is not a drive-by change: `bar_prices_product_from_unique` has to go, and both readers in
`server/utils/barPricing.ts` order by `effective_from` alone, so without a `created_at` tiebreaker
in each of them the till would resolve either row and could charge either price. It needs a
decision record, because "one row per date" is the rule the schema, the route and `docs/13` §3 all
state today.
