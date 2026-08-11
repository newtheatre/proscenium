# Known issues

Everything found in the August 2026 audit of commit `9d17251`. Nothing here has been fixed.

Severity is about consequences for the theatre, not code aesthetics:

- **P1** — customer-visible breakage, data loss risk, or exposure of personal data.
- **P2** — wrong numbers, or a foot-gun that will cause P1 later.
- **P3** — hygiene, drift, missing scaffolding.

| | Issue | Sev | Effort |
|---|---|---|---|
| 1 | [All emailed links are broken](#all-emailed-links-are-broken) | P1 | Minutes |
| 2 | [Booking confirmation links 404 even once fixed](#booking-confirmation-links-404) | P1 | Small |
| 3 | [Draft shows are publicly readable](#drafts-are-public) | P1 | Small |
| 4 | [Walk-in lookup leaks the user table](#walk-in-lookup-leaks-the-user-table) | P1 | Small |
| 5 | [No current-password challenge](#no-current-password-challenge) | P1 | Small |
| 6 | [Resend key crashes the whole worker](#resend-key-crashes-the-whole-worker) | P1 | Minutes |
| 7 | [Collection charges current prices, not paid prices](#collection-charges-current-prices) | P2 | Small |
| 8 | [`DOOR` status is never set](#door-status-is-never-set) | P2 | Minutes |
| 9 | [Nothing is transactional](#nothing-is-transactional) | P2 | Medium |
| 10 | [Capacity is bypassed by two write paths](#capacity-is-bypassed) | P2 | Small |
| 11 | [Publish resurrects cancelled performances](#publish-resurrects-cancelled-performances) | P2 | Minutes |
| 12 | [Refunds do not exist](#refunds-do-not-exist) | P2 | Medium |
| 13 | [Roles are stale until re-login](#roles-are-stale-until-re-login) | P2 | Small |
| 14 | [Customers cannot cancel their own booking](#customers-cannot-cancel) | P2 | Small |
| 15 | [Five copies of the price resolution rule](#five-copies-of-the-price-rule) | P3 | Small |
| 16 | [No shared types](#no-shared-types) | P3 | Medium |
| 17 | [`/calendar` calls an endpoint that does not exist](#calendar-is-dead) | P3 | Small |
| 18 | [Stagecraft collection is empty](#stagecraft-is-empty) | P3 | Small |
| 19 | [Dependency hygiene](#dependency-hygiene) | P3 | Small |
| 20 | [No tests, no CI, no lint script](#no-tests-no-ci) | P3 | Medium |

---

### All emailed links are broken

`nuxt.config.ts` declares `runtimeConfig.public.baseURL`. All four builders in
`server/utils/email.ts` read `useRuntimeConfig().public.baseUrl`. Every link in every email —
verification, password reset, booking confirmation, cancellation — currently renders as
`undefined/...`.

**Fix:** align the casing. Pick one and grep for the other.

**Note:** this means email verification and password reset are effectively non-functional in
production right now. That is worth checking against reality before anything else in this list.

### Booking confirmation links 404

Independent of the above. The confirmation email builds
`/whats-on/<slug>/booking/<bookingRef>?ref=<bookingRef>`, the page passes that path segment straight
into `useFetch('/api/bookings/' + id)`, and `server/api/bookings/[id]/index.get.ts` looks up
`eq(reservations.id, id)` — the nanoid primary key, not the six-character reference.

**Fix:** either make the handler accept a reference as well as an id, or emit `booking.id` in the
path and keep `?ref=` for authorisation. The second is less work; the first gives nicer URLs.

### Drafts are public

`GET /api/shows` and `GET /api/shows/:id` have no `authorize()` call. They return **all** shows
including `DRAFT`, with descriptions and internal performance `notes`, plus `ticketsSold`.
Unannounced productions are publicly enumerable.

`/api/whats-on` correctly filters to `PUBLISHED`; `/api/shows` does not.

**Fix:** add `authorize(event, listShows)` / `readShow` and let the public pages use
`/api/whats-on`. Check nothing customer-facing depends on `/api/shows` first.

### Walk-in lookup leaks the user table

`WalkInModal.lookupEmail()` does `$fetch('/api/users')` and filters client-side to find one address.
That downloads every customer name and email the theatre holds into the browser of any front-of-house
volunteer, on every walk-in.

**Fix:** add `GET /api/users?email=` returning at most one row, and use it. Also worth reconsidering
whether `BOX_OFFICE` should have blanket `listUsers` at all.

### No current-password challenge

`PUT /api/users/:id` accepts a new password with no proof of the old one. The account security page
fakes verification by calling `POST /api/auth/login` first — which as a side effect reissues the
session and bumps `lastLogin`. Anyone with a hijacked session, and any ADMIN or MANAGER, can set a
password unchallenged.

**Fix:** require `currentPassword` server-side when a user changes their own password.

### Resend key crashes the whole worker

`server/utils/resend.ts` throws at module load if `process.env.RESEND_API_KEY` is unset. On a Worker
that takes down the entire site, not just email. It also reads the bare environment variable while
`nuxt.config.ts` declares `runtimeConfig.resendApiKey` and the docs mention `NUXT_RESEND_API_KEY` —
three names for one secret, only one of which is read.

**Fix:** lazily construct the client inside the send function, return a no-op with a logged warning
when unconfigured, and read it from `useRuntimeConfig()`.

### Collection charges current prices

`CollectModal.vue` computes its totals from the currently-effective price rather than the
`pricePaid` snapshot on the existing tickets. If a price changes between booking and collection, the
customer is charged the new price at the door while holding an email quoting the old one.

**Fix:** display `pricePaid` for existing tickets; use current prices only for newly-added ones.

### `DOOR` status is never set

`POST /api/reservations` hardcodes `status: 'PENDING'`, and the collect modal then sets `COLLECTED`.
`DOOR` is only reachable by editing a reservation by hand. Pre-booked and on-the-door revenue are
therefore indistinguishable in `/api/admin/stats` and the treasurer's CSV.

**Fix:** have the walk-in path create `DOOR`, or set `DOOR` on collection when the reservation was
created in the same session. One line either way — but decide which the treasurer wants first.

### Nothing is transactional

Booking creation (shadow user → reservation → tickets), ticket diffing, reservation deletion and
role replacement are all multi-statement with no atomicity. A failure mid-sequence leaves partial
state — most visibly, a reservation with no tickets that still appears on the door list.

D1 has no interactive transactions. The fix is `db.batch()` where the statements can be decided up
front, and database constraints where they cannot.

### Capacity is bypassed

Enforced in `POST /api/bookings`. Not checked at all in `POST /api/reservations` (staff walk-in) or
`PUT /api/reservations/:id/tickets`. The box office can oversell the house with no warning.

Also: the check itself is read-then-write with no lock, so two concurrent public bookings can both
pass it.

**Fix:** extract a `assertCapacity(performanceId, additional)` helper and call it from all three.
The TOCTOU race needs either a batch with a conditional insert or acceptance — at this booking
volume, acceptance is defensible if it is written down.

### Publish resurrects cancelled performances

`POST /api/shows/:id/publish` documents itself as transitioning "all non-cancelled performances" to
`ON_SALE`, but the update has no status filter. Publishing a show puts its **cancelled**
performances back on sale. `updatedPerformanceCount` also counts all performances rather than those
actually changed.

**Fix:** add `and(ne(status, 'CANCELLED'))`.

### Refunds do not exist

`tickets.refundedAt` is read in five places — CSV export, ticket diffing, the collect modal, the
reservation tickets modal — and written by nothing. There is no endpoint that can refund a ticket.
The whole partial-refund story is schema-only.

**Fix:** either build it, or remove the column and the five readers so nobody assumes it works.

### Roles are stale until re-login

Roles are snapshotted into the session cookie at login. Granting or removing a role has no effect
until that person logs in again.

**Fix:** the `sessionEpoch` approach specified in the auth service plan — an integer on `users`,
embedded in the session, checked on refresh. ~20 lines, and it also gives you a force-logout button.

### Customers cannot cancel

`updateReservation` is staff-only. `cancelledBy: 'CUSTOMER'` exists in the schema and the UI but can
only be set by staff. The legacy system had self-service cancellation via an emailed link, so this
is a regression — and it means every cancellation is a phone call or an email to the box office.

### Five copies of the price rule

See [06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md#five-copies). One of the copies
carries a comment describing a different rule from the one it implements.

**Fix:** `resolveEffectiveTicketType()` returning `{ effectivePrice, active }`, and delete the rest.

### No shared types

There is no central types module. At least six divergent `Reservation` interfaces are declared
across `admin/reservations.vue`, `box-office/reservations.vue`, `CollectModal.vue`,
`ReservationEditModal.vue`, `bookings/my.get.ts` and `bookings/index.post.ts`. Server responses are
cast with `as` rather than inferred.

This is the largest ongoing maintainability tax in the codebase: a schema change does not produce a
type error anywhere it should.

**Fix:** derive types from the Drizzle schema (`InferSelectModel`) into `shared/types/`, and stop
casting.

### `/calendar` is dead

`app/pages/calendar.vue` fetches `/api/v1/calendar`. There is no `/api/v1/**` anywhere in the repo.

### Stagecraft is empty

`content.config.ts` declares a `stagecraft` collection with a detailed schema. `content/stagecraft/`
does not exist. The 817-line `get-involved/stagecraft.vue` renders nothing.

### Dependency hygiene

`nanoid`, `zod`, `scule` and `@tanstack/table-core` are imported but absent from `package.json` —
they resolve transitively today and will break on any dependency bump. Meanwhile `drizzle-kit`,
`better-sqlite3`, `@libsql/client`, `eslint` and `typescript` sit in `dependencies` rather than
`devDependencies`.

### No tests, no CI

No test framework, no `tests/`, no `.github/workflows/`, and no `lint` script despite ESLint being
configured. Deployment is a person on a laptop with no gate in front of it.

**Minimum worth having:** a CI workflow running `nuxt typecheck` and ESLint on pull requests, and
integration tests for the two handlers that touch money — `POST /api/bookings` and
`PUT /api/reservations/:id/tickets`.

---

## Suggested order

1. **#1, #6** — minutes each, and #1 means password reset is currently broken in production.
2. **#3, #4, #5** — the personal-data exposures. Do these before term starts.
3. **#7, #8** — the two that make the treasurer's numbers wrong.
4. **#20** — put CI in place before doing #9 and #10, so the fixes are gated.
5. **#9, #10, #15, #16** — the structural work. Do #15 and #16 before building passes, since passes
   adds callers to both.
