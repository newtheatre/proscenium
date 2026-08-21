# Known issues

Originally the August 2026 audit of commit `9d17251`. **Last reviewed: 2026-08-12**, after a
full-repo review whose fixes landed on `fix/review-sweep-aug-2026`.

Read this before planning work, and edit it when you fix something — a handover document that
says "nothing has been fixed" long after things were fixed costs the next person more time than
having no list at all.

Severity is about consequences for the theatre, not code aesthetics:

- **P1** — customer-visible breakage, data loss risk, or exposure of personal data.
- **P2** — wrong numbers, or a foot-gun that will cause P1 later.
- **P3** — hygiene, drift, missing scaffolding.

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
| 11 | Publish resurrects cancelled performances | `ne(status, 'CANCELLED')` on the update |
| 12 | Refunds do not exist | `POST /api/reservations/:id/refund` (see also the lifecycle rule below) |
| 15 | Five copies of the price rule | `resolveEffectiveTicketType()` is the only copy |
| 17 | `/calendar` calls an endpoint that does not exist | Page deleted |
| 19 | Dependency hygiene | Deps declared; build tooling moved to `devDependencies` |
| 20 | No CI, no lint script | `.github/workflows/ci.yml`; `lint` / `lint:fix` scripts |
| 21 | Production migration ledger empty; `d1 migrations list` always said "nothing to apply" | `migrations_dir` pinned in `nuxt.config.ts`; ledger backfilled and `0015` applied 2026-08-13 |
| 22 | [Editing a show wiped its write-up](#editing-a-show-wiped-its-write-up) | `ShowEditModal` loads the full record from `GET /api/shows/:id`; the five projected-away fields are omitted from the PUT unless it succeeded |

### Fixed in the August 2026 full-repo review

Also fixed, and worth knowing about because several were silent:

- **Stale staff sessions bypassed authorization entirely.** `nuxt-authorization`'s server
  `authorize()` swallows any non-`AuthorizationError` its resolver throws and then *resolves
  successfully*. Our resolver threw a 401 for stale role-holding sessions, so every ability check
  passed for them — and since sessions last 30 days and go stale after 15 minutes, that was the
  ordinary state of a staff session. Staleness is now expressed by dropping roles, not by throwing
  (`sessionUserForAuthorization`). **If you touch that resolver, it must never throw.**
- **GDPR erasure was silently reverted.** The mirror upsert runs on every authenticated request and
  rewrote name and email from the session, with no `anonymisedAt` guard — so an erased customer's
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
so the change looked safe — but `/admin/shows` passed the **list row itself** into `ShowEditModal`,
whose watcher read `show.longDescription ?? ''` on five now-absent keys and whose submit sent them
unconditionally as `null`. `PUT /api/shows/:id` guards on `!== undefined`, so `null` is a legitimate
clear and went straight through. Editing a show's *title* silently emptied its public write-up.

Three things made it survive review: the fields were absent rather than wrong, so nothing threw;
`?? ''` turned the absence into a plausible value; and the damage only showed on the public site.

The fix is on the client, not in the PUT — `null` really does mean "clear this" and that contract is
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
  and removes tickets freely — removing one is not a refund, because nothing was taken.
- **After collection** (`COLLECTED`, `DOOR`) money has changed hands and the composition is a record
  of a transaction. It cannot be edited; the only way to reverse any part of it is a refund, which
  is ADMIN/MANAGER only and leaves `refundedAt` behind as the audit trail.

Enforced in `server/utils/reservationLifecycle.ts` and applied by both ticket-diff routes and the
refund route.

---

### Roles are stale until re-login

Roles are snapshotted into the session cookie by the auth service. Granting or removing a role has
no effect until that session refreshes — up to 15 minutes for a staff session, and a customer's
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

Both write paths now call `assertCapacity`, and reinstating a cancelled reservation is checked too
— so the *bypasses* are gone. What remains is the race: the check and the insert are separate
statements, and on the public booking path there is a call to the auth service in between, so two
concurrent bookings can both pass a check that only one should.

At this booking volume that is defensible, and it is written down here rather than pretended away.
Closing it needs either a conditional insert in a batch or a per-performance lock.

### Customers cannot cancel

`updateReservation` is staff-only. `cancelledBy: 'CUSTOMER'` exists in the schema and the UI but can
only be set by staff. The legacy system had self-service cancellation via an emailed link, so this
is a regression — and it means every cancellation is a phone call or an email to the box office.

(`POST /api/bookings/:id/cancel` does let the *owner or token holder* cancel; what is missing is the
staff-facing reservation route treating a customer-initiated cancellation as such.)

### No shared types

There is no central types module. Divergent `Reservation`/`Booking` interfaces are declared across
`admin/reservations.vue`, `box-office/reservations.vue`, `CollectModal.vue`,
`ReservationEditModal.vue`, `whats-on/[slug]/booking/[id].vue`, `bookings/my.get.ts` and
`bookings/index.post.ts`. Server responses are cast with `as` rather than inferred.

This is the largest ongoing maintainability tax in the codebase: a schema change does not produce a
type error anywhere it should. It bit during the August review — adding `refundedAt` to the customer
booking shape required editing four unrelated component interfaces by hand, and missing one would
have been a silent money bug rather than a compile error.

**Fix:** derive types from the Drizzle schema (`InferSelectModel`) into `shared/types/`, and stop
casting.

**Partly done.** `shared/types/` now exists and holds `pagination.ts` (the `Paginated<T>` envelope,
which `admin/users.vue` had hand-copied) and `shows.ts` (the show and performance shapes, which the
shows page and four of its modals each declared separately). The reservation family is untouched and
is the bigger half.

One correction to the fix as written: **do not derive the wire types with `InferSelectModel`.** The
Drizzle model describes the *table*, and the API is not the table — `performances.startsAt` is a
`Date` in the model and an ISO string in the response, and the rows carry computed fields
(`ticketsSold`, `performanceCount`, the run window) that no column corresponds to. Deriving from the
schema would describe something the client never receives. `shared/types/shows.ts` is hand-written
for that reason, and says so.

### No tests

CI now runs build, typecheck and lint, but there is no test framework and no `tests/`.

**Minimum worth having:** integration tests for the handlers that touch money — `POST /api/bookings`,
`PUT /api/reservations/:id/tickets`, `POST /api/reservations/:id/refund` — and unit tests for
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

1. **#20a** — tests for the money handlers, before the structural work below.
2. **#16** — shared types. Everything else is safer afterwards.
3. **#9, #10a** — transactionality and the capacity race, together.
4. **#13, #14** — the two workflow gaps, whenever the box office next complains.
