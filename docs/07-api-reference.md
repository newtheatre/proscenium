# API Reference

Complete reference for the HTTP API exposed by Proscenium, the Nottingham New Theatre website and box office.

Everything here was transcribed from the handler source in `server/api/` and `server/routes/`. If the code and this document disagree, the code wins — please fix the document.

---

## 1. Preamble

### Base URL

| Environment | Base URL |
| --- | --- |
| Production | `https://newtheatre.org.uk` (also served on `https://proscenium.newtheatre.org.uk`) |
| Local development | `http://localhost:3000` |

All API endpoints live under `/api/`. The one exception is the blob-serving route at `/images/**`, which sits under `server/routes/` rather than `server/api/`.

### File-based routing

Every handler uses [Nitro's file-based routing](https://nitro.build/guide/routing). The path on disk *is* the URL, and the suffix before `.ts` is the HTTP method:

| File | Endpoint |
| --- | --- |
| `server/api/shows/index.get.ts` | `GET /api/shows` |
| `server/api/shows/index.post.ts` | `POST /api/shows` |
| `server/api/shows/[id]/index.put.ts` | `PUT /api/shows/:id` |
| `server/api/shows/[id]/poster.delete.ts` | `DELETE /api/shows/:id/poster` |
| `server/routes/images/[...pathname].get.ts` | `GET /images/**` |

Square brackets are route parameters, read inside the handler with `getRouterParam(event, 'id')`. A `[...name]` segment is a catch-all.

There is no central route table, no `app.use()`, and no server middleware directory. To find the code behind an endpoint, walk the path.

### Request validation

Handlers that take input validate it with [Zod](https://zod.dev) (`zod/v4`) through h3's validating readers:

```ts
const bodySchema = z.object({ /* … */ })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const query = await getValidatedQuery(event, querySchema.parse)
})
```

When `schema.parse` throws, h3 converts the `ZodError` into a **400** with `statusMessage: 'Validation Error'`, a `message` carrying Zod's summary, and the full issue list in `data`. Individual endpoint sections below do not repeat this — assume every documented schema can produce a 400 on malformed input.

A handful of older handlers read query strings with plain `getQuery(event)` and hand-check the values; those are called out where they occur.

One reusable schema lives in `server/utils/validation.ts`:

```ts
// passwordSchema
z.string()
  .min(8)                     // 'Password must be at least 8 characters long'
  .refine(/[a-z]/)            // at least one lowercase letter
  .refine(/[A-Z]/)            // at least one uppercase letter
  .refine(/\d/)               // at least one number
```

### Error shape

Handlers signal failure with h3's `createError`:

```ts
throw createError({ statusCode: 404, statusMessage: 'Show not found' })
```

which serialises to JSON as:

```jsonc
{
  "statusCode": 404,
  "statusMessage": "Show not found",
  "message": "Show not found",
  "data": null,           // populated for validation errors
  "stack": []             // populated in development only
}
```

Status codes used across the codebase:

| Code | Meaning in this API |
| --- | --- |
| 400 | Validation failure, missing route parameter, or a business-rule breach (duplicate slug, already-verified email, …) |
| 401 | No session where one is required (`requireUserSession` only) |
| 403 | Authorisation denied (see below), or a granular permission check inside a handler |
| 404 | Row not found — also used for "no override exists" and "this show has no poster" |
| 409 | Conflict: not enough capacity, or a delete blocked by a foreign key |
| 500 | Insert/select returned nothing unexpectedly, blob deletion failed, or an email failed to send |

### Authorisation

Two independent mechanisms are in play.

**`requireUserSession(event)`** — from `nuxt-auth-utils`. Throws **401 Unauthorized** when there is no session cookie. Used by exactly one handler (`GET /api/bookings/my`).

**`authorize(event, ability, ...args)`** — from `nuxt-authorization`. Resolves the session user via the Nitro plugin in `server/plugins/authorization-resolver.ts`, then runs the ability. Abilities live in `shared/utils/abilities/` and are re-exported from the barrel `shared/utils/abilities/index.ts`:

| File | Abilities |
| --- | --- |
| `abilities/users.ts` | `listUsers`, `createUser`, `readUser`, `updateUser`, `deleteUser`, `updateUserRoles`, `updateUserVerified`, `resetUserPassword` |
| `abilities/venues.ts` | `listVenues`, `createVenue`, `readVenue`, `updateVenue`, `deleteVenue`, `listVenueFeatures`, `createVenueFeature`, `readVenueFeature`, `updateVenueFeature`, `deleteVenueFeature` |
| `abilities/shows.ts` | `listShows`, `createShow`, `readShow`, `updateShow`, `deleteShow`, `createPerformance`, `updatePerformance`, `deletePerformance` |
| `abilities/tickets.ts` | `listTicketTypes`, `createTicketType`, `readTicketType`, `updateTicketType`, `deleteTicketType` |
| `abilities/reservations.ts` | `listReservations`, `createReservation`, `readReservation`, `updateReservation`, `deleteReservation` |

Role helpers in `abilities/types.ts`:

```ts
hasRole(user, role)      // user.roles.includes(`proscenium:${role}`)
isAdminOrManager(user)   // ADMIN | MANAGER
isStaff(user)            // ADMIN | MANAGER | BOX_OFFICE
```

The three roles are `ADMIN`, `MANAGER`, `BOX_OFFICE`. They arrive **namespaced** on the session as `proscenium:ADMIN` and friends, because one estate session carries every app's roles — `hasRole` adds the prefix for you. Never compare against a bare role name. A user with no `proscenium:` role is a plain customer.

**Roles go stale.** A session whose `refreshedAt` is older than 15 minutes has its `proscenium:` roles dropped for authorization purposes, so staff abilities fail closed until the browser refreshes through the auth service. See [04-auth-and-permissions](./04-auth-and-permissions.md).

**Two things about `authorize()` that are easy to get wrong:**

1. **It always requires a session.** Every ability in this repo is declared with the single-argument form `defineAbility(fn)`, which sets `allowGuest: false`. `nuxt-authorization` short-circuits to *denied* when the resolved user is `null`, *before* the ability body runs. So abilities whose body is `() => true` — `readShow`, `listShows`, `readTicketType`, `listVenues`, and friends — do **not** mean "public" when passed to `authorize()`. They mean "any logged-in user, regardless of role". The genuinely public endpoints achieve that by not calling `authorize()` at all.
2. **Denial is a 403, not a 401,** and the payload comes from the library rather than from `createError` in the handler: `statusCode: 403` with `message: 'Unauthorized'`. Do not pattern-match on `statusMessage` for authorisation failures.

`allows(event, ability)` is the non-throwing sibling. Note that `authorize()` **swallows any non-`AuthorizationError` thrown while resolving the user** and then resolves successfully — which is why `sessionUserForAuthorization` must never throw. See [04-auth-and-permissions](./04-auth-and-permissions.md#staleness-not-epochs).

> **Any handler with no `authorize()` and no `requireUserSession()` call is fully public** — reachable by anyone on the internet, unauthenticated. That includes `POST /api/bookings`, `GET /api/bookings/:id` (via a signed `?t=` token), all of `/api/whats-on`, `/api/venues` and `/api/venue-features` reads, `/api/ticket-types` reads, and `/images/**`. `GET /api/shows` and `GET /api/shows/:id` are **not** in that list any more — they now call `authorize()`, because they return DRAFT productions.

Public write paths are rate limited in `server/middleware/rateLimit.ts`, declared against route patterns rather than per handler.

### Money and dates

- All prices are **integers in pence**. `pricePaid` on a ticket is a snapshot taken at booking time.
- `performances.startsAt` and `doorsAt` are stored as Unix timestamps and exposed as ISO date strings in JSON. Performance write endpoints accept them as **seconds** and multiply by 1000 internally.
- `createdAt` / `updatedAt` on most tables are SQLite `current_timestamp` text values, not ISO 8601.

### The ticket price override chain

Three levels, most specific first:

```
performance override → show override → ticket type base price
```

Implemented in `server/utils/tickets.ts` (`loadTicketPriceContext`, `resolveEffectivePrice`, `validateTicketTypesExist`) and reimplemented inline in the several `available-ticket-types` / `whats-on` handlers. `active` resolves through the same chain against `ticketTypes.activeByDefault`. A `null` at a level means "fall through", not "off".

---

## 2. Endpoint summary

94 handler files under `server/api/` (counted 2026-08-21), plus the blob route, `/t/:ref` and the
dev-only login under `server/routes/`. The figure in an earlier revision of this document said
69, which was already behind the code: prefer `find server/api -name '*.ts' | wc -l` to the
number written here.

There are **no `/api/auth/*` endpoints**. Registration, login, logout, verification and password reset all live at `auth.newtheatre.org.uk` — this app reads the shared session cookie and never writes it. Anything in an older copy of this document describing `POST /api/auth/login` and friends is describing code that was deleted at the stage-door cutover.

In the Auth column, **Public** means no `authorize()` and no `requireUserSession()`; **Any user** means `authorize()` with a permissive ability (so login required, role irrelevant); **Staff** means ADMIN, MANAGER, or BOX_OFFICE.

### Service hooks (called by the auth service)

Authenticated by the SHA-256 of this app's `AUTH_SERVICE_TOKEN`, compared constant-time. Not reachable by a browser session.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/_hooks/auth/export` | Service token | This app's contribution to a subject-access bundle |
| POST | `/api/_hooks/auth/anonymise` | Service token | GDPR erasure: scrub the mirror row and reservation notes. Idempotent |
| POST | `/api/_hooks/auth/last-activity` | Service token | Most recent booking or pass per user, feeding the retention sweep |
| POST | `/api/_hooks/auth/merge` | Service token | Account merge: re-point every user-referencing row onto the winner, delete the losing mirror row. Idempotent |
| GET | `/api/_hooks/auth/manifest` | Service token | This app's role and permission declaration, polled by the auth service (stage-door ADR-0017) |

### The app manifest

`GET /api/_hooks/auth/manifest` returns `shared/utils/appManifest.ts` verbatim: the role namespace
(`proscenium`), the roles this app reads, and the permissions each carries. The auth service polls it
and turns it into role definitions, so **adding a role here is what makes it grantable** — nobody
types it into the auth admin UI.

It sits under `_hooks/` because it uses exactly the same auth as the GDPR hooks: the bearer is the
SHA-256 of this app's own service token.

Permissions are lowercase and dotted (`money.refund`) where roles are uppercase (`BOX_OFFICE`), so
the two can never be confused in a single string.

The ability layer resolves through it. `shared/utils/abilities/types.ts` holds the three shorthands
every `defineAbility` routes through, and each is now a permission: `isStaff` is `staff.access`,
`isAdminOrManager` is `programme.manage`, `isAdmin` is `catalogue.delete`. The individual abilities
are unchanged, so the truth table is identical; naming each one for the capability it actually means
is a separate, incremental job, one domain file at a time.

### Bookings (public-facing box office)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/bookings` | Public | Public booking flow — capacity-checked, sends a confirmation email |
| GET | `/api/bookings/my` | Logged in | The current user's bookings, split into upcoming and past |
| GET | `/api/bookings/:id` | Owner, staff, or a signed `?t=` token | Booking detail for a confirmation page, customer shape |
| GET | `/api/bookings/available-ticket-types` | Staff (`createReservation`) | Effective ticket prices for a performance before a reservation exists |
| PUT | `/api/bookings/:id/tickets` | Owner, or a signed `?t=` token | Customer self-service edit of their own ticket composition |
| POST | `/api/bookings/:id/cancel` | Owner, or a signed `?t=` token | Customer cancels their own PENDING booking |

### Reservations (staff box office)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/reservations` | Staff (`listReservations`) | Filterable reservation list, optionally with ticket counts |
| POST | `/api/reservations` | Staff (`createReservation`) | Create a reservation on a customer's behalf; capacity-checked |
| GET | `/api/reservations/:id` | Staff or owner (`readReservation`) | Reservation detail with tickets |
| PUT | `/api/reservations/:id` | Staff (`updateReservation`) | Change status, cancellation attribution, and notes |
| DELETE | `/api/reservations/:id` | ADMIN/MANAGER (`deleteReservation`) | Hard-delete the reservation and its tickets |
| PUT | `/api/reservations/:id/tickets` | Staff (`updateReservation`) | Set desired quantities per ticket type; server diffs and applies. **PENDING only** |
| POST | `/api/reservations/:id/refund` | ADMIN/MANAGER (`refundTicket`) | Refund n tickets of a type. **Collected bookings only** |
| GET | `/api/reservations/:id/available-ticket-types` | Staff (`updateReservation`) | Effective prices for this reservation's performance |

### Shows

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/shows` | Staff (`listShows`) | All shows including DRAFT, with performances and sales counts |
| POST | `/api/shows` | ADMIN/MANAGER (`createShow`) | Create a show |
| GET | `/api/shows/:id` | Any user (`readShow`) | One show with its performances |
| PUT | `/api/shows/:id` | ADMIN/MANAGER (`updateShow`) | Update show fields |
| DELETE | `/api/shows/:id` | ADMIN (`deleteShow`) | Delete a show; performances cascade |
| POST | `/api/shows/:id/poster` | ADMIN/MANAGER (`updateShow`) | Upload a poster image to R2 |
| DELETE | `/api/shows/:id/poster` | ADMIN/MANAGER (`updateShow`) | Delete the poster from R2 and clear the column |
| POST | `/api/shows/:id/publish` | ADMIN/MANAGER (`updateShow`) | Set status to PUBLISHED, optionally put performances on sale |

### Performances

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/shows/:id/performances` | ADMIN/MANAGER (`createPerformance`) | Add a performance to a show |
| PUT | `/api/shows/:id/performances/:performanceId` | ADMIN/MANAGER (`updatePerformance`) | Update a performance |
| DELETE | `/api/shows/:id/performances/:performanceId` | ADMIN/MANAGER (`deletePerformance`) | Delete a performance |

### Content warnings

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/content-warnings` | Staff (`listContentWarnings`) | The vocabulary, with a usage count per entry |
| POST | `/api/content-warnings` | ADMIN/MANAGER (`createContentWarning`) | Add a vocabulary entry |
| PUT | `/api/content-warnings/:id` | ADMIN/MANAGER (`updateContentWarning`) | Edit, archive or restore an entry |
| DELETE | `/api/content-warnings/:id` | ADMIN (`deleteContentWarning`) | Delete an entry; refused while any show uses it |
| GET | `/api/shows/:id/legacy-content-warnings` | Staff (`readShow`) | Pre-rework warnings the remap could not place |

### Ticket types and price overrides

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/ticket-types` | **Public** | Live types; `?includeArchived=true` adds retired ones |
| POST | `/api/ticket-types` | ADMIN/MANAGER (`createTicketType`) | Create a base ticket type |
| GET | `/api/ticket-types/:id` | **Public** | One base ticket type |
| PUT | `/api/ticket-types/:id` | ADMIN/MANAGER (`updateTicketType`) | Update a base ticket type, including archiving it |
| DELETE | `/api/ticket-types/:id` | ADMIN (`deleteTicketType`) | Delete a base ticket type |
| GET | `/api/shows/:id/ticket-types` | Any user (`readShow`) | Base types plus this show's overrides and effective values |
| PUT | `/api/shows/:id/ticket-types` | ADMIN/MANAGER (`updateShow`) | Upsert a show-level override |
| DELETE | `/api/shows/:id/ticket-types/:ticketTypeId` | ADMIN/MANAGER (`updateShow`) | Remove a show-level override |
| GET | `/api/shows/:id/performances/:performanceId/ticket-types` | Any user (`readShow`) | Full override chain for a performance |
| PUT | `/api/shows/:id/performances/:performanceId/ticket-types` | ADMIN/MANAGER (`updatePerformance`) | Upsert a performance-level override |
| DELETE | `/api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId` | ADMIN/MANAGER (`updatePerformance`) | Remove a performance-level override |

### Users

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/users` | Staff (`listUsers`) | Mirror users, paginated; `?email=` returns at most one |
| POST | `/api/users` | ADMIN/MANAGER (`createUser`) | Create a shadow account via the auth service and mirror it |
| GET | `/api/users/:id` | Staff or self (`readUser`) | One mirror user |
| DELETE | `/api/users/:id` | ADMIN (others) or self (`deleteUser`) | Delete the mirror row; refuses if they have bookings |

Credentials, roles, verification and erasure are the auth service's — there is no `PUT /api/users/:id`
and no password-reset route here.

### Passes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/pass-types` | Staff (`listPassTypes`) | Pass products with prices, scope and issued counts |
| POST | `/api/pass-types` | ADMIN/MANAGER (`managePassTypes`) | Create a pass product (always `DRAFT`) |
| PUT | `/api/pass-types/:id` | ADMIN/MANAGER (`managePassTypes`) | Edit a product; **the only way to put one on sale** |
| GET | `/api/passes` | Staff (`listPasses`) | Search issued passes; `?performanceId=` adds door eligibility |
| POST | `/api/passes` | Staff (`issuePass`) | Issue a pass to a holder |
| PUT | `/api/passes/:id` | ADMIN/MANAGER (`cancelPass`) | Cancel or reinstate an issued pass |
| POST | `/api/passes/:id/redeem` | Staff (`redeemPass`) | Admit a holder to a performance |

### Venues

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/venues` | **Public** | All venues with features |
| POST | `/api/venues` | ADMIN/MANAGER (`createVenue`) | Create a venue and attach features |
| GET | `/api/venues/:id` | **Public** | One venue with features |
| PUT | `/api/venues/:id` | ADMIN/MANAGER (`updateVenue`) | Update a venue; `featureIds` replaces the whole set |
| DELETE | `/api/venues/:id` | ADMIN (`deleteVenue`) | Delete a venue and its R2 image |
| POST | `/api/venues/:id/image` | ADMIN/MANAGER (`updateVenue`) | Upload a venue image to R2 |
| DELETE | `/api/venues/:id/image` | ADMIN/MANAGER (`updateVenue`) | Delete the venue image from R2 |
| GET | `/api/venue-features` | **Public** | All venue features |
| POST | `/api/venue-features` | ADMIN/MANAGER (`createVenueFeature`) | Create a feature |
| GET | `/api/venue-features/:id` | **Public** | One feature |
| PUT | `/api/venue-features/:id` | ADMIN/MANAGER (`updateVenueFeature`) | Update a feature |
| DELETE | `/api/venue-features/:id` | ADMIN (`deleteVenueFeature`) | Delete a feature; venue links cascade |

### What's On

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/whats-on` | **Public** | Published shows with future on-sale performances |
| GET | `/api/whats-on/:slug` | **Public** | One published show with per-performance ticket types and sold-out flags |

### Rota

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/shifts` | Staff or `foh.work` (`listShifts`) | Every shift on performances in a date window |
| GET | `/api/shifts/unstaffed` | Staff or `foh.work` (`listShifts`) | Performances soon with no confirmed duty manager |
| PUT | `/api/shifts/:id` | `shift.manage` (`manageShifts`) | Assign, reassign, confirm or empty a slot |
| DELETE | `/api/shifts/:id` | `shift.manage` (`manageShifts`) | Remove a slot from the rota |
| GET | `/api/performances/:id/shifts` | Staff or `foh.work` (`listShifts`) | The rota for one performance |
| POST | `/api/performances/:id/shifts` | `shift.manage` (`manageShifts`) | Add a slot, open or filled |

### Admin

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | ADMIN/MANAGER (inline ability) | Dashboard aggregates: revenue, counts, recent reservations |
| GET | `/api/admin/export/tickets` | ADMIN/MANAGER (inline ability) | CSV export of every ticket, for the treasurer |
| GET | `/api/admin/reservation-counts` | Staff (`listReservations`) | Reservation totals by status, for the box-office status pills |

### Media

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/images/**` | **Public** | Stream a blob out of R2 by pathname |

### Show night

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/foh/tonight` | `foh.work` (`workFoh`) | Tonight's performances this user may work, scoped by the rota |
| GET | `/api/foh/lookup` | `foh.work` (`workFoh`) | Find a booking on tonight's performances, by reference, name or email |
| GET | `/api/foh/glance` | `foh.work` (`workFoh`) | Tonight's numbers, and the questions the door gets asked |
| GET | `/api/foh/emergency` | `foh.work` (`workFoh`) | The venue's emergency card for a performance |
| GET | `/api/foh/contacts` | `foh.work` (`workFoh`) | Who is on tonight, and the numbers to call |
| GET | `/api/foh/incidents` | `foh.work` (`workFoh`) | The incident log for a performance |
| POST | `/api/foh/incidents` | `foh.work` (`workFoh`) | Add an entry. **There is no update or delete** |
| GET | `/api/admin/foh/emergency` | `foh.manage` | Every venue's emergency card, for editing |
| PUT | `/api/admin/foh/emergency/:venueId` | `foh.manage` | Upsert one venue's card |
| GET/POST | `/api/admin/foh/contacts` | `foh.manage` | The contact list |
| PUT | `/api/admin/foh/contacts/:id` | `foh.manage` | Edit or archive a contact |

### Short booking links

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/t/:ref` | **Public** | Short booking handle. Resolves the reference and redirects; grants nothing |

### Health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | **Public** | Uptime check. 503 naming pending migrations when the schema is behind the code |

---

## 3. Endpoint detail

### 3.1 Service hooks

Called by stage-door, never by a browser. Each authenticates with `Authorization: Bearer <sha256hex>`
where the value is the SHA-256 of this app's own `AUTH_SERVICE_TOKEN` — the auth service stores only
the hash, so no plaintext ever travels and the hash cannot be replayed inbound against the auth
service. Verified constant-time in `server/utils/hookAuth.ts`; anything else is a bare 401.

#### `POST /api/_hooks/auth/export`

**Source** `server/api/_hooks/auth/export.post.ts` · **Auth** Service token

**Body** `{ userId: string }`

**Returns** `{ data: { profile, reservations[], passes[] } }` — the personal data this app holds for
that person: mirror profile, every reservation with its show, performance, status, notes, ticket
count and total paid, and every pass. Empty structures rather than a 404 when the person never used
this app.

#### `POST /api/_hooks/auth/anonymise`

**Source** `server/api/_hooks/auth/anonymise.post.ts` · **Auth** Service token

**Body** `{ userId: string }` · **Returns** `{ ok: true }`

Rewrites the mirror row to `deleted-<userId>@anonymised.invalid` / `Deleted user` — byte-identical
to what stage-door writes centrally — and clears **both** `customerNotes` and `staffNotes` on every
reservation the person owns, stamping `anonymisedAt`. Bookings and ticket rows survive: attendance
and revenue statistics stay intact, the person does not.

**Idempotent**, and returns `{ ok: true }` for a user this app has never seen, because stage-door
retries until every app succeeds and an erasure is not complete until they all do.

#### `POST /api/_hooks/auth/last-activity`

**Source** `server/api/_hooks/auth/last-activity.post.ts` · **Auth** Service token

**Body** `{ userIds: string[] }` (max 500) · **Returns** `{ [userId]: epochMs | null }`

The most recent reservation or pass per user, feeding the retention sweep's guest cohort. Every
requested id appears in the response, `null` where nothing is known. Ids are chunked at 90 per query
internally — D1 binds at most 100 parameters per statement, and stage-door batches at 90 for the
same reason.

#### `POST /api/_hooks/auth/merge`

**Source** `server/api/_hooks/auth/merge.post.ts` · **Auth** Service token

**Body** `{ fromUserId: string, toUserId: string, dryRun?: boolean }` · **Returns** `{ ok: true, notMirrored, counts }`

This app's share of an estate-wide account merge (stage-door ADR-0015). Re-points
`reservations.userId`, `passes.userId`, `passes.issuedByUserId` and
`pass_admissions.redeemedByUserId` from the losing account onto the winner, then deletes the losing
mirror row — with nothing referencing it the `restrict` FKs are satisfied, and the sales record now
lives intact on the winner. `dryRun: true` returns the affected-row `counts` without writing;
stage-door shows them in its pre-merge report. Each statement binds two parameters however many rows
move, so no chunking is needed.

**Idempotent**, and `{ ok: true, notMirrored: true }` for a losing account this app has never seen —
stage-door retries until every app succeeds.

### 3.2 Bookings

`/api/bookings` is the customer-facing half of the box office. `/api/reservations` is the staff-facing half. They write to the same `reservations` and `tickets` tables.

---

#### `POST /api/bookings`

**Source** `server/api/bookings/index.post.ts` · **Auth** **Public** — no `authorize()`, no `requireUserSession()`

```ts
{
  performanceId: z.string().min(1),

  // Required only for guests; ignored when a session is present
  name:  z.string().min(1).optional(),
  email: z.email().optional(),

  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity:     z.int().min(1).max(10),   // per line, not per booking
  })).min(1),                                // 'At least one ticket is required'

  customerNotes: z.string().optional(),
}
```

**Response** `200` — the created reservation with relations:

```jsonc
{
  "id": "…", "bookingRef": "A3KP7X", "status": "PENDING",
  "customerNotes": null, "performanceId": "…", "userId": "…",
  "user": { "id": "…", "name": "…", "email": "…" },
  "performance": {
    "startsAt": "2026-03-04T19:30:00.000Z", "doorsAt": null,
    "show":  { "id": "…", "title": "…", "slug": "…" },
    "venue": { "id": "…", "name": "…", "address": "…" }
  },
  "tickets": [ { "id": "…", "pricePaid": 600, "ticketType": { "id": "…", "name": "Student" } } ]
}
```

One `tickets` row is created per seat — a line of `quantity: 3` yields three rows, each with its own `pricePaid` snapshot.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Name and email are required for guest bookings` |
| 404 | `Performance not found or not on sale` — the lookup filters on `status = 'ON_SALE'`, so a DRAFT or CANCELLED performance is indistinguishable from a missing one |
| 400 | `Show is not currently published` |
| 400 | `This performance has already started` |
| 409 | `Not enough tickets available for this performance` |
| 400 | `Ticket type <id> not found` (from `validateTicketTypesExist`) |
| 500 | `Failed to create guest account` / `Failed to create reservation` |

**Capacity check.** `assertCapacity` — effective capacity is `performance.capacityOverride ?? venue.capacity`, and both `null` means uncapped. Occupied seats are counted by `countOccupiedSeats`, the one shared rule: non-refunded tickets on `PENDING`/`COLLECTED`/`DOOR` reservations, excluding `PASS_SALE` types (a pass purchase is not a seat — the seat is the separate `PASS_ADMISSION` ticket). Every write path calls it, including reinstating a cancelled reservation. **It remains a read-then-write with no lock** — two concurrent bookings can both pass and jointly oversell. Accepted at this volume; see [09-known-issues](./09-known-issues.md#capacity-is-still-read-then-write).

**Side effects**
- Guests are matched to an existing account by email if one exists (including a staff account — the booking is then attributed to that user); otherwise a **shadow account** is created with `password: null, verified: false`.
- Sends a booking confirmation email via Resend. The promise is *not* awaited: failures are logged, and the promise is handed to `event.context.cloudflare?.context.waitUntil()` so the Worker stays alive until it settles. The response is returned regardless.

---

#### `GET /api/bookings/my`

**Source** `server/api/bookings/my.get.ts` · **Auth** `requireUserSession` — any logged-in user, no role needed

**Query** none.

**Response** `200`

```jsonc
{
  "upcoming": [ /* reservations, newest-created first */ ],
  "past":     [ /* … */ ]
}
```

Each entry uses the shared `reservationDetailWith` shape (`server/utils/queries/reservations.ts`): the reservation columns plus `user` (id, name, email, verified — never the password hash), `performance` with nested `show` (id, title, slug) and `venue` (id, name), and `tickets` ordered by `createdAt` with `ticketType` (id, name, description).

A booking is **upcoming** when the performance starts in the future *and* the status is not `CANCELLED` or `NO_SHOW`; everything else is **past**. Note that `staffNotes` is included in this customer-facing payload.

**Errors** `401` when there is no session.

---

#### `GET /api/bookings/:id`

**Source** `server/api/bookings/[id]/index.get.ts` · **Auth** owner, staff, **or** a valid signed access token

`:id` may be the nanoid primary key or the six-character `bookingRef`, because confirmation emails link with the reference.

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `t` | string, optional | A signed, expiring booking access token ([ADR-0009](decisions/0009-signed-booking-access-tokens.md)). On first use the handler moves it into an httpOnly cookie so the page can drop it from the address bar. |

Access is granted, in order: (1) session user is the booking's `userId`; (2) session user holds ADMIN, MANAGER or BOX_OFFICE; (3) a valid `?t=` token, or the cookie it was swapped for.

**`?ref=` is not an access path.** The booking reference is a customer-facing identifier — printed on emails, read aloud at the box office — and was previously accepted as a bearer credential; it is not, and must not be reintroduced as one.

A stale session keeps its identity but loses its roles, so the owner branch keeps working while the staff branch fails closed until the browser refreshes ([ADR-0008](decisions/0008-roles-go-stale-identity-does-not.md)).

Note that the booking is loaded from the database *before* the access check, so a wrong `id` yields 404 and a right `id` with no credentials yields 403 — which confirms the id exists.

**Response** `200` — the **customer** shape, allow-listed by `reservationCustomerColumns`: `id`, `bookingRef`, `status`, `cancelledBy`, `customerNotes`, `performanceId`, timestamps, plus `performance` → `show` and `venue`, and `tickets` → `ticketType`. It does **not** include `staffNotes`, `legacyRef` or `userId`; the staff shape is `GET /api/reservations/:id`.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Booking ID is required` |
| 404 | `Booking not found` |
| 403 | `You do not have access to this booking` |

---

#### `PUT /api/bookings/:id/tickets`

**Source** `server/api/bookings/[id]/tickets.put.ts` · **Auth** owner, or a valid signed access token — same check as `GET /api/bookings/:id`

Customer self-service edit of their own ticket composition. The same desired-quantity diff as the staff route (`PUT /api/reservations/:id/tickets`), with self-service guards on top.

**Body**

| Name | Type | Notes |
| --- | --- | --- |
| `tickets` | array, required, min 1 | `{ ticketTypeId, quantity }`, where `quantity` is the desired **total** for that type, 0–10 |

A ticket type may appear only once. The handler reads each type's current count from a map it does not update, so two entries for one type would compound rather than replace.

**Guards** the booking must be `PENDING` ([ADR-0011](decisions/0011-collection-is-the-payment-boundary.md)); the performance must be `ON_SALE`, in the future, and inside its booking window (`bookingClosesHoursBefore`); only active ticket types may be added; capacity is enforced; and the booking cannot be emptied — cancel it instead.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Validation, performance not `ON_SALE`, booking window closed, inactive ticket type, or an attempt to empty the booking |
| 403 | Not the owner and no valid token |
| 404 | `Booking not found` |
| 409 | Already collected, or the change would oversell |

---

#### `POST /api/bookings/:id/cancel`

**Source** `server/api/bookings/[id]/cancel.post.ts` · **Auth** owner, or a valid signed access token

Lets a customer cancel their own booking. Only a `PENDING` booking for a future performance may be cancelled.

**Side effects** sets `status = 'CANCELLED'`, `cancelledBy = 'CUSTOMER'`, and sends a cancellation email best-effort via `waitUntil`. Cancelling releases the seats ([ADR-0007](decisions/0007-one-seat-counting-rule.md)).

**Response** `200` — `{ "status": "CANCELLED" }`

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Not `PENDING`, or the performance has already started |
| 403 | Not the owner and no valid token |
| 404 | `Booking not found` |

---

#### `GET /api/bookings/available-ticket-types`

**Source** `server/api/bookings/available-ticket-types.get.ts` · **Auth** `authorize(event, createReservation)` — **staff only** (ADMIN, MANAGER, BOX_OFFICE), despite living under `/bookings`

Used by the walk-in / door-sales modal, which needs override-aware prices before any reservation exists.

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `performanceId` | string, required | Read with plain `getQuery` and hand-checked |

**Response** `200` — every base ticket type, sorted by name:

```jsonc
[ { "id": "…", "name": "Adult", "description": null, "effectivePrice": 800, "active": true } ]
```

`active` and `effectivePrice` are resolved through performance → show → base. Inactive types are **returned, not filtered** — the caller decides what to do with them.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `performanceId query parameter is required` |
| 404 | `Performance not found` |
| 403 | Not staff |

---

### 3.3 Reservations

---

#### `GET /api/reservations`

**Source** `server/api/reservations/index.get.ts` · **Auth** `authorize(event, listReservations)` — staff

```ts
// query schema
{
  performanceId: z.string().optional(),
  showId:        z.string().optional(),
  userId:        z.string().optional(),
  status:        z.enum(['PENDING','COLLECTED','DOOR','CANCELLED','NO_SHOW']).optional(),
  withCounts:    z.enum(['true','false']).optional(),   // string, not boolean
}
```

Filters combine with AND. `showId` is resolved to that show's performance IDs first; a show with no performances short-circuits to `[]`. Supplying both `showId` and `performanceId` applies both conditions.

**Response** `200` — an array in `reservationSummaryWith` shape: reservation columns plus `user` (id, name, email, verified) and `performance` → `show` (id, title, slug) and `venue` (id, name). **No `tickets` array** — this is the list view. Ordered by `createdAt` descending.

With `withCounts=true`, each row gains `ticketCount`: the number of non-refunded tickets. The parameter is a **string enum**, not a boolean — only `'true'` and `'false'` validate, anything else is a 400, and only the exact string `'true'` triggers the count.

**SQLite parameter limit.** The count query batches reservation IDs into **chunks of 800** (`const chunkSize = 800`) and issues one grouped `COUNT` per chunk, because a single `IN (…)` with thousands of bound parameters would exceed SQLite/D1's limit. If you add a similar bulk lookup elsewhere, copy this pattern.

**Errors** `403` when not staff; `400` on an invalid `status` or `withCounts` value.

---

#### `POST /api/reservations`

**Source** `server/api/reservations/index.post.ts` · **Auth** `authorize(event, createReservation)` — staff

```ts
z.object({
  performanceId: z.string().min(1),

  // Either userId, or both name and email
  userId: z.string().optional(),
  name:   z.string().min(1).optional(),
  email:  z.email().optional(),
  phone:  z.string().optional(),          // accepted and then discarded — there is no phone column

  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity:     z.int().min(1).max(20), // note: 20 here, 10 on the public route
  })).min(1),

  customerNotes: z.string().optional(),
  staffNotes:    z.string().optional(),
}).refine(
  data => data.userId || (data.name && data.email),
  { message: 'Either userId or both name and email are required' },
)
```

**Response** `200` — the created reservation in `reservationSummaryWith` shape (no `tickets` array; fetch the detail endpoint if you need it).

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Refinement failure: `Either userId or both name and email are required` |
| 404 | `Performance not found` |
| 404 | `User not found` (when `userId` was supplied) |
| 400 | `Ticket type <id> not found` |
| 500 | `Failed to create guest account` / `Failed to create reservation` |

**Differences from the public `POST /api/bookings` — read this before reusing either.**

| | `POST /api/bookings` (public) | `POST /api/reservations` (staff) |
| --- | --- | --- |
| Capacity check | Yes, 409 when it would oversell | **None — never checks capacity** |
| Performance status | Must be `ON_SALE` | Any status, including DRAFT and CANCELLED |
| Show status | Must be `PUBLISHED` | Not checked |
| Past performances | Rejected | Allowed |
| Max quantity per line | 10 | 20 |
| Confirmation email | Sent | **Not sent** |
| `staffNotes` | Not accepted | Accepted |

The staff route is deliberately permissive so the box office can overbook, sell into an unpublished show, and record retrospective sales. The consequence is that it is the only way to oversell a house — nothing downstream re-validates capacity.

**Side effects** Resolves or creates a shadow account exactly as the public route does (match on email, else insert with `password: null`). Inserts one ticket row per seat with `pricePaid` resolved at current rates.

---

#### `GET /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.get.ts` · **Auth** `authorize(event, readReservation, { userId })` — staff can read any; a customer can read one whose `userId` matches their session

The reservation is loaded *before* the authorisation call, since the ability needs the owner's id.

**Response** `200` — `reservationDetailWith` shape: reservation columns (including `staffNotes`), `user`, `performance` → `show` + `venue`, and `tickets` (with `ticketType`) ordered by `createdAt`.

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `403` when neither staff nor owner.

---

#### `PUT /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.put.ts` · **Auth** `authorize(event, updateReservation)` — staff

```ts
z.object({
  status:        z.enum(['PENDING','COLLECTED','DOOR','CANCELLED','NO_SHOW']).optional(),
  cancelledBy:   z.enum(['CUSTOMER','STAFF']).optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  staffNotes:    z.string().optional().nullable(),
}).refine(
  data => !(data.status === 'CANCELLED' && !data.cancelledBy),
  { message: 'cancelledBy is required when status is CANCELLED' },
)
```

Only keys actually present are written; explicit `null` clears the column. Moving *away* from `CANCELLED` without naming `cancelledBy` clears `cancelledBy` automatically.

**Response** `200` — the updated `reservations` row (no relations).

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Refinement failure when cancelling without `cancelledBy` |
| 400 | `Reservation ID is required` |
| 400 | `No valid fields provided for update` (empty body) |
| 404 | `Reservation not found` |
| 403 | Not staff |

**Side effects** When `status` transitions **to** `CANCELLED` from something else, a cancellation email is sent to the customer. As with the booking confirmation, it is fire-and-forget with `.catch()` logging and `event.context.cloudflare?.context.waitUntil()`. Re-cancelling an already-cancelled reservation sends nothing. Cancelling does **not** delete or refund the ticket rows — they stay, and simply stop counting towards capacity and revenue because those queries filter on status.

---

#### `DELETE /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.delete.ts` · **Auth** `authorize(event, deleteReservation)` — **ADMIN or MANAGER only** (BOX_OFFICE cannot)

**Response** `200` — `{ message: 'Reservation deleted successfully' }`

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `403` for BOX_OFFICE and customers.

**Side effects** Hard delete. Deletes all `tickets` rows for the reservation first — required, because `tickets.reservationId` is `onDelete: 'restrict'` — then the reservation. There is no soft-delete, no audit row, and no email. Revenue history for that booking disappears from `/api/admin/stats` and the CSV export. Prefer `PUT … { status: 'CANCELLED' }` in almost every real situation.

---

#### `PUT /api/reservations/:id/tickets`

**Source** `server/api/reservations/[id]/tickets.put.ts` · **Auth** `authorize(event, updateReservation)` — staff

```ts
{
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity:     z.int().min(0).max(50),   // 0 removes every active row of that type
  })).min(1),
}
```

This is a **declarative diff**, not an increment. You send the desired *total* active quantity per ticket type; the server compares it with the current state and inserts or deletes rows to match.

- `quantity > current` → insert the difference.
- `quantity < current` → delete the difference, **newest rows first (LIFO)** — rows are sorted oldest-first by `createdAt` and the tail is removed.
- `quantity === current` → no-op.
- Ticket types **omitted from the body are left untouched**. To empty a reservation you must list every type explicitly with `quantity: 0`.
- Rows with `refundedAt` set are excluded from the current-state query and are never inserted, deleted, or counted.

**Price re-resolution — the thing to watch.** Newly inserted rows get `pricePaid` from `resolveEffectivePrice` **at the current override chain**, not from the prices in the rest of the reservation. If the show price changed after the original booking, adding a seat to an old reservation records the *new* price, and the reservation ends up with mixed `pricePaid` values for the same ticket type. Existing rows are never repriced. Deletion is a hard `DELETE`, so shrinking a reservation destroys the original price snapshot.

**Response** `200` — the full reservation in `reservationDetailWith` shape, so the caller can re-render immediately.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Reservation ID is required` |
| 404 | `Reservation not found` |
| 500 | `Performance not found` — a 500, not a 404, because it indicates a broken foreign key |
| 400 | `Ticket type <id> not found` |
| 403 | Not staff |

**Side effects** No capacity check whatsoever, and no email. Inserts and deletes run as separate statements outside a transaction.

---

#### `GET /api/reservations/:id/available-ticket-types`

**Source** `server/api/reservations/[id]/available-ticket-types.get.ts` · **Auth** `authorize(event, updateReservation)` — staff (note: the *update* ability, not a read ability)

**Response** `200` — identical shape to `/api/bookings/available-ticket-types`: every base type with `{ id, name, description, effectivePrice, active }`, sorted by name, resolved through performance → show → base for this reservation's performance. Inactive types are included.

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `500 Performance not found`; `403` when not staff.

---

### 3.4 Shows

---

#### `GET /api/performances`

**Source** `server/api/performances/index.get.ts` · **Auth** `authorize(event, listShows)` — any logged-in user

A flat, chronological list of performances, each with its `show` and `venue` attached and
`ticketsSold` resolved. Performances otherwise exist only nested under a show, which is why the box
office used to download all 498 shows and 1,304 performances to render one navigator.

**Query**

| | | |
|---|---|---|
| `near` | `YYYY-MM-DD` | the `limit` performances **closest to** that date, roughly half either side |
| `from`, `to` | `YYYY-MM-DD` | inclusive window, Europe/London |
| `showId` | | one show's performances |
| `status` | `DRAFT` \| `ON_SALE` \| `CANCELLED` | exact match; omitted, cancelled are excluded and DRAFT ones are **included** |
| `order` | `asc` \| `desc` | default `asc`; ignored with `near` |
| `page`, `limit` | | default limit 50, max 200 |

`near` exists because a fixed window is the wrong primitive for "what's on around now": the theatre
goes quiet over the summer, so any window is sometimes empty, and an empty navigator on the door is
worse than an old one. `near` returns something whenever anything exists, so the caller needs no
fallback. Each side asks for the full `limit` and takes up the other's slack, so a pivot outside the
season still fills the window. In `near` mode the response is one centred window rather than a page:
`page` is always 1 and `total` is the size of that window.

Ticket counts scope through a subquery over the time span the page covers, so the page's own ids are
never bound — two parameters whether the page holds five performances or two hundred.

---

#### `GET /api/shows`

**Source** `server/api/shows/index.get.ts` · **Auth** `authorize(event, listShows)` — any logged-in user

> This endpoint returns every show, including `DRAFT` ones. Each show carries its full `performances`
> array, and each performance includes the internal `notes` column — production notes that are
> explicitly "not shown to customers" per the schema — along with `capacityOverride`, `ticketsSold`,
> and DRAFT/CANCELLED statuses. `listShows` resolves to "any logged-in user, regardless of role"
> (see §2), so a customer account is enough to enumerate the unannounced season. The customer-safe
> alternative is `/api/whats-on`.

**Query** — the response is always the standard `{ rows, total, page, limit }` envelope.

| | | |
|---|---|---|
| `scope` | `all` \| `active` \| `current` \| `upcoming` \| `archive` \| `draft` | default `all` |
| `status` | `DRAFT` \| `PUBLISHED` | |
| `q` | ≤100 chars | matches title, subtitle, slug **and venue name** |
| `from`, `to` | `YYYY-MM-DD` | shows with a performance inside the window, inclusive, Europe/London |
| `view` | `tree` \| `options` | `tree` nests performances; `options` returns `{ id, slug, title, status }` |
| `sort` | `run` \| `title` | default `run` — earliest performance |
| `order` | `asc` \| `desc` | defaults to `desc` for `scope=archive`, `asc` otherwise |
| `page` | | default 1 |
| `limit` | | default 25, **max 50** for `view=tree`, 500 for `view=options` |

`draft`, `current`, `upcoming` and `archive` **partition** every show — each show is in exactly one,
so per-tab counts add up to the whole. `active` is `current ∪ upcoming`. A published show with no
performances counts as `archive`, which is the only scope with an `IS NULL` arm and the reason the
partition holds. "Today" is resolved in `Europe/London`, not the Worker's UTC.

A `tree` page is capped at 50 rows because the page's show ids are the one thing bound as a list, and
50 of those plus a fully-loaded filter stays comfortably under D1's 100-parameter limit. Every filter
is a correlated subquery and binds nothing that grows with the archive; per-performance lookups scope
through a subquery rather than binding ~150 performance ids. Do not raise the cap without recounting.

A `tree` row adds `performanceCount`, `firstPerformanceAt` and `lastPerformanceAt` to the fields below.

**Response** `200` — `rows`, each with:

```jsonc
{
  "id": "…", "slug": "…", "title": "…", "subtitle": null, "description": "…",
  "posterUrl": "shows/abc/image-1712.jpg", "status": "DRAFT",
  "createdAt": "…", "updatedAt": "…",
  "ticketTypeOverrideCount": 2,
  "performances": [{
    "id": "…", "showId": "…", "venueId": "…",
    "startsAt": "…", "doorsAt": null, "durationMinutes": 90,
    "intervalCount": 0, "intervalMinutes": null,
    "capacityOverride": null, "status": "DRAFT", "notes": "internal note",
    "venue": { "id": "…", "name": "…", "capacity": 70 },
    "ticketTypeOverrideCount": 0,
    "ticketsSold": 12
  }]
}
```

`ticketsSold` counts non-refunded tickets on reservations with status `PENDING`, `COLLECTED`, or `DOOR`. Returns `[]` when there are no shows.

**Errors** None beyond infrastructure failures.

---

#### `POST /api/shows`

**Source** `server/api/shows/index.post.ts` · **Auth** `authorize(event, createShow)` — ADMIN or MANAGER

```ts
{
  title: z.string().min(1),                                   // 'Title is required'
  slug:  z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), // lowercase, digits, single hyphens
  subtitle:    z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT','PUBLISHED']).optional().default('DRAFT'),
}
```

**Response** `200` — the created `shows` row.

**Errors** `400 A show with this slug already exists`; `400` on a slug that fails the regex; `403` for BOX_OFFICE and customers; `500 Failed to create show`.

---

#### `GET /api/shows/:id`

**Source** `server/api/shows/[id]/index.get.ts` · **Auth** `authorize(event, readShow)` — any logged-in user

> Same exposure as `GET /api/shows`: DRAFT shows returned, `performances[].notes` included, and
> `readShow` means "any logged-in user, regardless of role".

**Response** `200` — one show with **every column**, `performances` ordered by `startsAt` (each with
`venue`, `ticketsSold` and `ticketTypeOverrideCount`), `contentWarnings` with their vocabulary
entries resolved, plus `ticketTypeOverrideCount`, `performanceCount`, `firstPerformanceAt` and
`lastPerformanceAt`.

> **Anything that edits a show must read it from here.** `GET /api/shows` returns a column
> *projection* that omits `longDescription`, `programmeUrl`, `externalUrl`, `contentWarningNotes` and
> `warningsConfirmedNone`. A form populated from a list row cannot see those five, and writing back
> what it never read is what silently emptied shows' write-ups — see
> [09-known-issues](./09-known-issues.md#editing-a-show-wiped-its-write-up).

Every count scopes through a subquery on this show's performances rather than binding their ids, so
the parameter cost is fixed however long the run.

**Errors** `400 Show ID is required`; `404 Show not found`.

---

#### `PUT /api/shows/:id`

**Source** `server/api/shows/[id]/index.put.ts` · **Auth** `authorize(event, updateShow)` — ADMIN or MANAGER

```ts
{
  title:       z.string().min(1).optional(),
  slug:        z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  subtitle:    z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  posterUrl:   z.string().optional().nullable(),   // raw blob pathname; prefer the poster endpoints
  longDescription:       z.string().max(20000).optional().nullable(),
  programmeUrl:          z.url().max(2048).optional().nullable(),
  externalUrl:           z.url().max(2048).optional().nullable(),
  categoryId:            z.string().optional().nullable(),
  contentWarningNotes:   z.string().max(2000).optional().nullable(),
  warningsConfirmedNone: z.boolean().optional(),
  contentWarnings: z.array(z.object({          // full replacement; omit to leave alone
    contentWarningId: z.string().min(1),
    level: z.enum(['MENTIONED','DISCUSSED','DEPICTED']).nullable(),
  })).max(80).optional(),
  status:      z.enum(['DRAFT','PUBLISHED']).optional(),
}
```

Only present keys are written. An empty body returns the existing row unchanged with `200`.

`contentWarnings` replaces the show's links wholesale, in one `db.batch` chunked at 30 rows (D1 caps
bound parameters at 100 and each link binds three). Repeated ids are deduped before the write —
the unique index is `(show_id, content_warning_id)`, so a duplicate would otherwise fail mid-batch.

`level` must be `null` for a technical warning and set for a general one. That spans two tables, so
SQLite cannot express it as a CHECK; the handler looks the submitted ids up and rejects a mismatch
with `400 "<title>" is a technical effect and cannot have a level` or
`400 "<title>" needs a level: mentioned, discussed or depicted`. An id not in the vocabulary is
`400 Unknown content warning: <id>`.

**Response** `200` — the updated `shows` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `400 A show with this slug already exists` (checked only when the slug actually changes); `403`.

**Side effects** Setting `posterUrl` here rewrites the column **without** touching R2 — the old blob is orphaned and the new pathname is not validated. Use `POST /api/shows/:id/poster` instead. Setting `status: 'DRAFT'` is the only way to unpublish a show; the publish endpoint cannot.

---

#### `DELETE /api/shows/:id`

**Source** `server/api/shows/[id]/index.delete.ts` · **Auth** `authorize(event, deleteShow)` — **ADMIN only**

**Response** `200` — `{ message: 'Show deleted successfully' }`

**Errors** `400 Show ID is required`; `404 Show not found`; `403` for MANAGER, BOX_OFFICE, and customers.

**Side effects** A cascading delete with no confirmation step and no dry run:

- `performances` cascade (`onDelete: 'cascade'`).
- `show_ticket_type_overrides` cascade.
- `performance_ticket_type_overrides` cascade along with their performances.
- `tickets.performanceId` is `onDelete: 'restrict'`, so **if any performance has ever had a ticket issued, the database rejects the delete** and the error surfaces uncaught as a 500 rather than a tidy 409. Cancel and clear the bookings first.
- The poster blob in R2 is **not** deleted and becomes orphaned.

---

#### `POST /api/shows/:id/poster`

**Source** `server/api/shows/[id]/poster.post.ts`, via `validateAndUploadImage` in `server/utils/images.ts` · **Auth** `authorize(event, updateShow)` — ADMIN or MANAGER

**Body** `multipart/form-data` with a single file field named **`poster`**.

| Constraint | Value |
| --- | --- |
| Allowed MIME types | `image/jpeg`, `image/jpg`, `image/png`, `image/webp` |
| Maximum size | 5 MB (`5 * 1024 * 1024`) |
| Stored at | `shows/<showId>/image-<Date.now()>.<ext>` |
| Access | `public` |

**Response** `200` — the updated `shows` row, with `posterUrl` set to the new blob pathname. Render it through `/images/<pathname>`.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `No file provided` / `No file provided (field name: poster)` |
| 400 | `Invalid file type. Only JPEG, PNG, and WebP images are allowed` |
| 400 | `File size exceeds 5MB limit` |
| 404 | `Show not found` |
| 403 | Not ADMIN/MANAGER |

**Side effects** Uploads to Cloudflare R2. Deletes the previous blob first when `posterUrl` was set; a failed deletion is logged and swallowed, so the upload still proceeds and the old object is orphaned.

---

#### `DELETE /api/shows/:id/poster`

**Source** `server/api/shows/[id]/poster.delete.ts` · **Auth** `authorize(event, updateShow)` — ADMIN or MANAGER

**Response** `200` — the updated `shows` row with `posterUrl: null`.

**Errors** `400 Show ID is required`; `404 Show not found`; `404 This show has no poster`; `403`.

**Side effects** Deletes the object from R2 **before** clearing the column, and unlike the upload path this deletion is not wrapped in a try/catch — an R2 failure surfaces as a 500 and the column keeps pointing at the (possibly deleted) blob.

---

#### `POST /api/shows/:id/publish`

**Source** `server/api/shows/[id]/publish.post.ts` · **Auth** `authorize(event, updateShow)`, plus a second `authorize(event, updatePerformance)` when `markPerformancesOnSale` is true — ADMIN or MANAGER for both

```ts
{ markPerformancesOnSale: z.boolean().optional().default(false) }
```

**Response** `200`

```jsonc
{ "show": { /* updated shows row */ }, "updatedPerformanceCount": 4 }
```

**Errors** `400 Show ID is required`; `404 Show not found`; `403`.

**Side effects and two discrepancies worth knowing:**

1. Despite the "toggle" wording in the source comment, this endpoint **only ever sets `PUBLISHED`**. It never unpublishes. Use `PUT /api/shows/:id` with `status: 'DRAFT'` for that.
2. The docstring says it transitions "all non-cancelled performances from DRAFT → ON_SALE", but the query is `UPDATE performances SET status = 'ON_SALE' WHERE show_id = :id` with **no status filter**. It therefore also resurrects `CANCELLED` performances and puts them on sale. `updatedPerformanceCount` is the number of rows returned by the update, i.e. every performance on the show, not the number that actually changed.

---

### 3.5 Performances

---

#### `POST /api/shows/:id/performances`

**Source** `server/api/shows/[id]/performances/index.post.ts` · **Auth** `authorize(event, createPerformance)` — ADMIN or MANAGER

```ts
{
  venueId:  z.string().min(1),                                    // 'Venue is required'
  startsAt: z.number().int(),                                     // UNIX SECONDS — multiplied by 1000
  doorsAt:  z.number().int().optional().nullable(),               // unix seconds
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount:   z.number().int().nonnegative().optional().default(0),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT','ON_SALE','CANCELLED']).optional().default('DRAFT'),
  notes:  z.string().optional().nullable(),                       // internal, but see the GET /api/shows warning
}
```

`startsAt` and `doorsAt` are **seconds**, not milliseconds — the handler does `new Date(body.startsAt * 1000)`. Passing milliseconds silently schedules the performance tens of thousands of years from now. `doorsAt` is falsy-checked, so `0` becomes `null`.

**Response** `200` — the created `performances` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `403`; `500 Failed to create performance`. `venueId` is **not** verified to exist — an unknown venue produces a foreign-key error surfacing as a 500.

---

#### `PUT /api/shows/:id/performances/:performanceId`

**Source** `server/api/shows/[id]/performances/[performanceId]/index.put.ts` · **Auth** `authorize(event, updatePerformance)` — ADMIN or MANAGER

```ts
{
  venueId:  z.string().min(1).optional(),
  startsAt: z.number().int().optional(),                          // unix seconds
  doorsAt:  z.number().int().optional().nullable(),               // unix seconds
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount:   z.number().int().nonnegative().optional(),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT','ON_SALE','CANCELLED']).optional(),
  notes:  z.string().optional().nullable(),
}
```

The performance is looked up by `id` **and** `showId`, so a mismatched pair returns 404 rather than editing another show's performance. Only present keys are written; an empty body returns the existing row with `200`.

**Response** `200` — the updated `performances` row.

**Errors** `400 Show ID and Performance ID are required`; `404 Performance not found`; `403`.

**Side effects** Lowering `capacityOverride` below the number of tickets already sold is permitted — nothing re-validates existing bookings. Setting `status: 'CANCELLED'` sends no emails to affected customers; that has to be done by hand.

---

#### `DELETE /api/shows/:id/performances/:performanceId`

**Source** `server/api/shows/[id]/performances/[performanceId]/index.delete.ts` · **Auth** `authorize(event, deletePerformance)` — ADMIN or MANAGER

**Response** `200` — `{ message: 'Performance deleted successfully' }`

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Show ID and Performance ID are required` |
| 404 | `Performance not found` (also when the performance belongs to a different show) |
| 409 | `Cannot delete this performance because it has tickets associated with it` — the delete is wrapped in a try/catch that converts the FK violation |
| 403 | Not ADMIN/MANAGER |

**Side effects** `performance_ticket_type_overrides` cascade. Reservations pointing at the performance block the delete via `reservations.performanceId` restrict, which is also caught and reported as the same 409.

---

### 3.5a Content warnings

The shared vocabulary every show picks from. A warning is either a **technical effect** — strobe,
haze, loud noise, no level — or a **general** theme recorded on each show as `MENTIONED`,
`DISCUSSED` or `DEPICTED`. See [ADR-0004](./decisions/0004-content-warning-model.md).

#### `GET /api/content-warnings`

**Source** `server/api/content-warnings/index.get.ts` · **Auth** `authorize(event, listContentWarnings)` — staff

**Query** `includeArchived` (`'true'`/`'false'`, default `'false'`) · `kind` (`TECHNICAL`/`GENERAL`)

**Response** `200` — an array of `{ id, slug, title, kind, category, description, icon, sort, archived, showCount }`,
ordered technical-first then by `(sort, title)`. `showCount` is a correlated subquery counting the
shows that carry the entry; it is what the admin page uses to warn before a rename and what blocks a
delete.

> The show editor and the admin page must not share a `useFetch` key. The editor caches the live
> vocabulary under `content-warnings` and reads it back through `getCachedData`; the admin page asks
> for archived entries and keys itself `admin-content-warnings` so the editor never offers them.

#### `POST /api/content-warnings`

**Source** `server/api/content-warnings/index.post.ts` · **Auth** `authorize(event, createContentWarning)` — ADMIN or MANAGER

```ts
{
  title:       z.string().min(1).max(80),
  slug:        z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),  // derived from title if absent
  kind:        z.enum(['TECHNICAL','GENERAL']),
  category:    z.string().max(60).optional().nullable(),   // forced null when kind is TECHNICAL
  description: z.string().max(300).optional().nullable(),
  icon:        z.string().max(80).optional().nullable(),
  sort:        z.number().int().min(0).max(9999).optional(),
}
```

**Response** `200` — the created row.

**Errors** `400 A content warning with the slug "…" already exists`; `400 A content warning with this title already exists`; `400 Title must contain at least one letter or number`; `403`.

#### `PUT /api/content-warnings/:id`

**Source** `server/api/content-warnings/[id]/index.put.ts` · **Auth** `authorize(event, updateContentWarning)` — ADMIN or MANAGER

Same body as `POST`, every key optional, plus `archived: z.boolean().optional()`. Only present keys
are written; an empty body returns the existing row.

**Errors** `404 Content warning not found`; the two uniqueness `400`s above; `403`; and
`409 Cannot change the type of this warning while N show(s) use it` — `kind` decides whether a link
carries a level, and the existing links were written under the old answer, so there is no correct
level to invent on their behalf.

#### `DELETE /api/content-warnings/:id`

**Source** `server/api/content-warnings/[id]/index.delete.ts` · **Auth** `authorize(event, deleteContentWarning)` — **ADMIN only**

**Response** `200` — `{ message: 'Content warning deleted successfully' }`

**Errors** `404 Content warning not found`; `403`;
`409 Cannot delete "<title>" because N show(s) use it. Archive it instead…`.

> The foreign key is `onDelete: 'restrict'`, deliberately. Under a cascade, deleting an entry would
> have stripped it from every show carrying it with nothing to show a customer or an auditor that it
> was ever there. Archiving is the retirement path: the entry stops being offered on new shows and
> keeps rendering on the ones that have it.

#### `GET /api/shows/:id/legacy-content-warnings`

**Source** `server/api/shows/[id]/legacy-content-warnings.get.ts` · **Auth** `authorize(event, readShow)` — staff

**Response** `200` — `[{ title, kind }]`: the warnings this show carried before the rework that
migration 0016 could not map onto the new vocabulary, ordered by title. Empty for most shows; 30 have
entries. The show editor renders them under "Not carried over from the old system".

Read from `show_content_warnings_archive.mapped_to_warning_id IS NULL` — the migration's own record —
rather than derived by looking for archive ids missing from the live table. The remap collapses rows
(`Sexism` and `Misogyny` both became `sexism`), so only one of the two ids survives and the other
would look dropped.

---

### 3.6 Ticket types and price overrides

#### `GET /api/ticket-types`

**Source** `server/api/ticket-types/index.get.ts` · **Auth** **Public** — no `authorize()`; the comment in the source explains that booking flows need it

**Query** `?includeArchived=true` to include retired types. Omitted or `false` returns only live
ones, so a caller that just wants "the ticket types" cannot accidentally offer a dead Fringe type.
The management screen at `/admin/ticket-types` is the one caller that passes it, because it is where
types are archived and restored.

**Response** `200` — `ticket_types` rows ordered by name:
`{ id, name, description, price, kind, archived, activeByDefault, createdAt, updatedAt }`.
`price` is in pence.

`archived` and `activeByDefault` answer different questions — see
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md#archived-vs-activebydefault--two-different-questions).

---

#### `POST /api/ticket-types`

**Source** `server/api/ticket-types/index.post.ts` · **Auth** `authorize(event, createTicketType)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),                    // 'Name is required'
  description: z.string().optional(),
  price:       z.number().int().nonnegative(),       // pence; 0 is valid (free tickets)
  activeByDefault: z.boolean().optional().default(true),
}
```

**Response** `200` — the created row. **Errors** `400 A ticket type with this name already exists`; `403`; `500 Failed to create ticket type`.

---

#### `GET /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.get.ts` · **Auth** **Public**

**Response** `200` — one `ticket_types` row. **Errors** `400 Ticket type ID is required`; `404 Ticket type not found`.

---

#### `PUT /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.put.ts` · **Auth** `authorize(event, updateTicketType)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price:       z.number().int().nonnegative().optional(),
  activeByDefault: z.boolean().optional(),
}
```

An empty body returns the existing row with `200`.

**Response** `200` — the updated row. **Errors** `400 Ticket type ID is required`; `404 Ticket type not found`; `400 A ticket type with this name already exists`; `403`.

**Side effects** Changing `price` affects **future** price resolution only. Already-issued tickets keep their `pricePaid` snapshot — but any row added later through `PUT /api/reservations/:id/tickets` picks up the new price, which is how a single reservation ends up with two prices for one ticket type.

---

#### `DELETE /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.delete.ts` · **Auth** `authorize(event, deleteTicketType)` — **ADMIN only**

**Response** `200` — `{ message: 'Ticket type deleted successfully' }`

**Errors** `400 Ticket type ID is required`; `404 Ticket type not found`; `409 Cannot delete this ticket type because it has issued tickets associated with it`; `403`.

**Side effects** `show_ticket_type_overrides` and `performance_ticket_type_overrides` referencing the type cascade away. Issued `tickets` restrict the delete, caught and reported as the 409 above.

---

#### `GET /api/shows/:id/ticket-types`

**Source** `server/api/shows/[id]/ticket-types/index.get.ts` · **Auth** `authorize(event, readShow)`

> `readShow` is `defineAbility(() => true)`, but because it is used through `authorize()` with `allowGuest: false`, **a session is still required**. Effective access: any logged-in user, no role needed. Guests get a 403.

**Response** `200` — every base ticket type, ordered by name, annotated with this show's override:

```jsonc
[{
  "id": "…", "name": "Student", "description": null, "price": 700,
  "activeByDefault": true, "createdAt": "…", "updatedAt": "…",
  "override": { "id": "…", "showId": "…", "ticketTypeId": "…", "price": 500, "active": null, … } | null,
  "effectivePrice": 500,
  "effectiveActive": true
}]
```

**Errors** `400 Show ID is required`; `404 Show not found`; `403` when not logged in.

---

#### `PUT /api/shows/:id/ticket-types`

**Source** `server/api/shows/[id]/ticket-types/index.put.ts` · **Auth** `authorize(event, updateShow)` — ADMIN or MANAGER

```ts
{
  ticketTypeId: z.string().min(1),                         // 'Ticket type ID is required'
  price:  z.number().int().nonnegative().optional().nullable(),   // pence; null = inherit base price
  active: z.boolean().optional().nullable(),                      // null = inherit activeByDefault
}
```

An **upsert** keyed on (`showId`, `ticketTypeId`), matching the unique index. One ticket type per request.

Note that omitting a field is the same as sending `null`: the handler writes `body.price ?? null` and `body.active ?? null` in both the insert and the update branch. Updating an existing override to change only `active` therefore **wipes its `price` back to inherit**. Always send both fields.

**Response** `200` — the created or updated `show_ticket_type_overrides` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `404 Ticket type not found`; `403`.

---

#### `DELETE /api/shows/:id/ticket-types/:ticketTypeId`

**Source** `server/api/shows/[id]/ticket-types/[ticketTypeId]/index.delete.ts` · **Auth** `authorize(event, updateShow)` — ADMIN or MANAGER

**Response** `200` — `{ message: 'Show ticket type override removed' }`

**Errors** `400 Show ID and Ticket Type ID are required`; `404 Show not found`; `404 No override exists for this ticket type`; `403`.

**Side effects** The type reverts to base defaults for this show. Performance-level overrides on the same show are untouched and continue to win. Already-issued tickets keep their prices.

---

#### `GET /api/shows/:id/performances/:performanceId/ticket-types`

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/index.get.ts` · **Auth** `authorize(event, readShow)` — any logged-in user (see the note above; guests get 403)

**Response** `200` — every base ticket type ordered by name, with both override levels exposed separately:

```jsonc
[{
  "id": "…", "name": "Adult", "price": 800, "activeByDefault": true, …,
  "showOverride": { … } | null,
  "perfOverride": { … } | null,
  "effectivePrice":  700,     // perfOverride.price ?? showOverride.price ?? price
  "effectiveActive": true     // perfOverride.active ?? showOverride.active ?? activeByDefault
}]
```

**Errors** `400 Show ID and Performance ID are required`; `404 Show not found`; `404 Performance not found`; `403`.

---

#### `PUT /api/shows/:id/performances/:performanceId/ticket-types`

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/index.put.ts` · **Auth** `authorize(event, updatePerformance)` — ADMIN or MANAGER

Same body schema as the show-level upsert:

```ts
{
  ticketTypeId: z.string().min(1),
  price:  z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional().nullable(),
}
```

Upsert keyed on (`performanceId`, `ticketTypeId`). The same "omitted means null" caveat applies — send both `price` and `active` on every call.

**Response** `200` — the created or updated `performance_ticket_type_overrides` row.

**Errors** `400 Show ID and Performance ID are required`; `404 Show not found`; `404 Performance not found`; `404 Ticket type not found`; `403`.

---

#### `DELETE /api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId`

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/[ticketTypeId]/index.delete.ts` · **Auth** `authorize(event, updatePerformance)` — ADMIN or MANAGER

**Response** `200` — `{ message: 'Performance ticket type override removed' }`

**Errors** `400 Show ID, Performance ID and Ticket Type ID are required`; `404 Show not found`; `404 Performance not found`; `403`.

Unlike its show-level counterpart, this handler does **not** check that the override exists — deleting a non-existent override succeeds with the same 200 message.

---

### 3.7 Users

These act on the **local mirror** only — `id`, `email`, `name`, `anonymisedAt`, timestamps. Credentials, roles, verification and erasure belong to the auth service; there is deliberately no `PUT /api/users/:id`, no password reset and no role editor here, and the abilities that used to describe them have been removed rather than left implying a permission model this app does not enforce.

```jsonc
{
  "id": "…", "email": "…", "name": "…",
  "anonymisedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

Anonymised rows and legacy `.invalid` placeholders never appear in listings or lookups — they surface only as a `hiddenAnonymised` count on the paginated response.

---

#### `GET /api/users`

**Source** `server/api/users/index.get.ts` · **Auth** `authorize(event, listUsers)` — staff (ADMIN, MANAGER, BOX_OFFICE)

**Query** `?email=` returns **at most one row, as a bare array** — the exact-address lookup the box-office walk-in form uses, so a volunteer's browser never receives the user table. Otherwise `?page`, `?limit` (max 100) and `?q` (name or email, case-insensitive) give the paginated envelope `{ rows, total, page, limit, hiddenAnonymised }`.

Note the two response shapes from one path; `?email=` is the exception to the `Paginated<T>` contract in `server/utils/pagination.ts`.

**Errors** `403`.

---

#### `POST /api/users`

**Source** `server/api/users/index.post.ts` · **Auth** `authorize(event, createUser)` — ADMIN or MANAGER, plus granular `allows()` checks

```ts
{
  email: z.email(),
  name:  z.string().min(1),                                        // 'Name is required'
  verified: z.boolean().optional().default(false),                 // ADMIN only when true
  roles: z.array(z.enum(['ADMIN','MANAGER','BOX_OFFICE'])).optional().default([]),  // ADMIN only when non-empty
}
```

A MANAGER may create a plain user, but `allows(event, updateUserVerified)` and `allows(event, updateUserRoles)` are ADMIN-only, so a MANAGER sending `verified: true` or any `roles` gets a 403.

**Response** `200` — the formatted user with roles.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `User with this email already exists` |
| 502 | The auth service is unreachable, or `NUXT_AUTH_SERVICE_TOKEN` is unset |
| 403 | Not ADMIN/MANAGER |

**Side effects** Calls `POST /api/users/shadow` on the auth service to match or create the central
identity, then mirrors the returned id locally. No password is set and no email is sent — the person
claims the account by registering or signing in with Google on the same address, and their booking
history comes with it. If the auth service is unreachable the operation fails rather than creating a
local-only user, because an id this app invented would never match the central one.

---

#### `GET /api/users/:id`

**Source** `server/api/users/[id]/index.get.ts` · **Auth** `authorize(event, readUser, user)` — staff can read anyone; any user can read themselves

The row is fetched before the check, so an unknown id yields 404 regardless of who is asking.

**Response** `200` — the formatted user. **Errors** `400 User ID is required`; `404 User not found`; `403`.

---

#### `DELETE /api/users/:id`

**Source** `server/api/users/[id]/index.delete.ts` · **Auth** `authorize(event, deleteUser, { id: userId })`

The `deleteUser` ability is unusual — read it carefully:

| Caller | Target | Allowed? |
| --- | --- | --- |
| Non-ADMIN | themselves | ✅ yes (self-service account deletion) |
| ADMIN | someone else | ✅ yes |
| ADMIN | themselves | ❌ **no** — admins cannot delete their own account |
| MANAGER / BOX_OFFICE | someone else | ❌ no |

**Response** `200` — `{ message: 'User deleted successfully' }`

**Errors** `400 User ID is required`; `404 User not found`; `403`.

**Side effects** none — this deletes the mirror row only, and the central identity is untouched. **`reservations.userId` and `passes.userId` are both `onDelete: 'restrict'`**, so anyone who has ever booked or held a pass cannot be deleted; the handler pre-checks reservations and returns 409. To remove a *person*, use erasure at the auth service, which calls this app's anonymise hook. The caller's session is not cleared when they delete themselves.

---

### 3.7a Passes and pass types

Season and festival passes. Design notes in [10-passes-design](./10-passes-design.md); the
entitlement rule lives in `server/utils/passes.ts` and nowhere else.

#### `GET /api/pass-types`

**Source** `server/api/pass-types/index.get.ts` · **Auth** `authorize(event, listPassTypes)` — staff

Pass products with their price variants, show scope count and issued count.

#### `POST /api/pass-types`

**Source** `server/api/pass-types/index.post.ts` · **Auth** `authorize(event, managePassTypes)` — ADMIN or MANAGER

Creates a product, its price variants and its show scope in one batch. **Always created `DRAFT`** —
use the route below to put it on sale.

`validFrom` / `validTo` accept `YYYY-MM-DD` and are stored as the **first and last instants of those
days in Europe/London**, so a pass covers the whole of its final day. Passing a full ISO datetime
overrides that.

#### `PUT /api/pass-types/:id`

**Source** `server/api/pass-types/[id]/index.put.ts` · **Auth** `authorize(event, managePassTypes)` — ADMIN or MANAGER

Edits a product and is the **only** way to change `status`. The box office offers `ON_SALE` types
only, so without this a pass product could never be sold.

**Errors** `409` when putting a product on sale that covers no shows (it would be redeemable
nowhere), and `409` when lowering `maxIssued` below the number already issued.

#### `GET /api/passes`

**Source** `server/api/passes/index.get.ts` · **Auth** `authorize(event, listPasses)` — staff

Paginated `{ rows, total, page, limit }`. `?q` matches reference, holder name or holder email.

With `?performanceId=`, each row gains `redeemable: { ok, reason?, message? }` — the door check,
decided for the whole page in four queries rather than five per pass.

#### `POST /api/passes`

**Source** `server/api/passes/index.post.ts` · **Auth** `authorize(event, issuePass)` — staff

Issues a pass to a holder, creating a shadow account via the auth service when the buyer has none.
Enforces `maxIssued` against ACTIVE passes.

#### `PUT /api/passes/:id`

**Source** `server/api/passes/[id]/index.put.ts` · **Auth** `authorize(event, cancelPass)` — ADMIN or MANAGER

Cancels or reinstates one issued pass.

#### `POST /api/passes/:id/redeem`

**Source** `server/api/passes/[id]/redeem.post.ts` · **Auth** `authorize(event, redeemPass)` — staff

Admits a pass holder to a performance: writes a £0 `PASS_ADMISSION` ticket and a `pass_admissions`
ledger row in one batch. `canRedeem` checks, in order, that the pass is ACTIVE, in date, covers the
show, has not already been used for this performance, that the performance is ON_SALE, and that
there is room.

`UNIQUE (pass_id, performance_id)` on `pass_admissions` **is** the once-per-performance rule — D1 has
no interactive transactions, so that index is what holds under a double-submit.

The ledger row is protected at three depths, because losing it makes a used pass redeemable again
with nothing left to show it was ever used:

1. `validateTicketTypesSellable` rejects `PASS_ADMISSION` on every ticket write path, so the box
   office cannot step the quantity down to zero.
2. `DELETE /api/reservations/:id` returns 409 when the reservation holds an admission.
3. `pass_admissions.ticket_id` is `ON DELETE restrict` (migration 0015), so the database refuses the
   delete even from a path nobody has thought of yet. It was `cascade` until then, which is what
   made (1) and (2) load-bearing rather than merely friendly.

To un-redeem a pass, delete the `pass_admissions` row and then its ticket, in that order.

Rejections in `STAFF_OVERRIDABLE` (currently only `PERFORMANCE_NOT_ON_SALE`) can be overridden at
the door; the rest cannot.

---

### 3.8 Venues

Venue responses come from `formatVenueResponse` (`server/utils/queries/venues.ts`), which flattens the `venuesToFeatures` join into a `features` array of full feature rows:

```jsonc
{
  "id": "…", "name": "Nottingham New Theatre", "address": "…",
  "capacity": 70, "imageUrl": "venues/abc/image-1712.jpg", "description": "…",
  "createdAt": "…", "updatedAt": "…",
  "features": [ { "id": "…", "name": "Wheelchair Accessible", "description": "…", "icon": "…" } ]
}
```

---

#### `GET /api/venues`

**Source** `server/api/venues/index.get.ts` · **Auth** **Public** — no `authorize()`

**Response** `200` — all venues with features, ordered by name.

---

#### `POST /api/venues`

**Source** `server/api/venues/index.post.ts` · **Auth** `authorize(event, createVenue)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),                       // 'Name is required'
  address:     z.string().optional(),
  capacity:    z.number().int().positive().optional(),  // null/absent = unlimited for capacity checks
  description: z.string().optional(),
  featureIds:  z.array(z.string()).optional().default([]),
}
```

**Response** `200` — the created venue with features.

**Errors** `400 Venue with this name already exists`; `403`; `500 Failed to create venue` / `Failed to retrieve created venue`.

**Side effects** Inserts `venues_to_features` join rows for each `featureIds` entry. IDs are **not** validated, so an unknown feature id raises a foreign-key error as a 500 *after* the venue has been created. There is no image field here — upload separately.

---

#### `GET /api/venues/:id`

**Source** `server/api/venues/[id]/index.get.ts` · **Auth** **Public**

**Response** `200` — one venue with features. **Errors** `400 Venue ID is required`; `404 Venue not found`.

---

#### `PUT /api/venues/:id`

**Source** `server/api/venues/[id]/index.put.ts` · **Auth** `authorize(event, updateVenue)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  address:     z.string().optional().nullable(),
  capacity:    z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  featureIds:  z.array(z.string()).optional(),
}
```

**Response** `200` — the updated venue with features.

**Errors** `400 Venue ID is required`; `404 Venue not found`; `400 Venue name is already taken`; `403`; `500 Failed to retrieve updated venue`.

**Side effects** `featureIds` is a **full replacement**: every existing join row is deleted and the supplied list inserted. Sending `[]` removes all features; omitting the key leaves them alone. `imageUrl` cannot be set here. Lowering `capacity` below tickets already sold is permitted and silently makes affected performances over-capacity.

---

#### `DELETE /api/venues/:id`

**Source** `server/api/venues/[id]/index.delete.ts` · **Auth** `authorize(event, deleteVenue)` — **ADMIN only**

**Response** `200` — `{ message: 'Venue deleted successfully' }`

**Errors** `400 Venue ID is required`; `404 Venue not found`; `403`.

**Side effects** Deletes the venue image from R2 first, logging and continuing if that fails. `venues_to_features` rows cascade. **`performances.venueId` is `onDelete: 'restrict'`**, so a venue with any performance cannot be deleted and the FK error surfaces as an uncaught 500 — note the R2 image may already have been destroyed by that point.

---

#### `POST /api/venues/:id/image`

**Source** `server/api/venues/[id]/image.post.ts`, via `validateAndUploadImage` · **Auth** `authorize(event, updateVenue)` — ADMIN or MANAGER

**Body** `multipart/form-data` with a single file field named **`image`** (the show equivalent uses `poster`). Same constraints: JPEG/PNG/WebP, max 5 MB, stored at `venues/<venueId>/image-<Date.now()>.<ext>` with public access.

**Response** `200` — `{ imageUrl: '<pathname>', message: 'Image uploaded successfully' }`. Note this differs from the show poster endpoint, which returns the whole updated row.

**Errors** `400 Venue ID is required`; the three `validateAndUploadImage` 400s (`No file provided`, `No file provided (field name: image)`, `Invalid file type…`, `File size exceeds 5MB limit`); `404 Venue not found`; `403`.

**Side effects** Uploads to R2 and deletes the previous blob, swallowing deletion failures.

---

#### `DELETE /api/venues/:id/image`

**Source** `server/api/venues/[id]/image.delete.ts` · **Auth** `authorize(event, updateVenue)` — ADMIN or MANAGER

**Response** `200` — `{ message: 'Image deleted successfully' }`

**Errors** `400 Venue ID is required`; `404 Venue not found`; `404 Venue has no image to delete`; `500 Failed to delete image from storage`; `403`.

**Side effects** Unlike the venue *delete* handler, an R2 failure here aborts with a 500 and the `imageUrl` column is left pointing at the blob.

---

#### `GET /api/venue-features`

**Source** `server/api/venue-features/index.get.ts` · **Auth** **Public**

**Query** `page`, `limit` (max 100, default 25) and optional `q`, matching `name`.

**Response** `200` — the `Paginated<T>` envelope, rows ordered by name: `{ rows: [{ id, name, description, icon, createdAt, updatedAt }], total, page, limit }`.

---

#### `POST /api/venue-features`

**Source** `server/api/venue-features/index.post.ts` · **Auth** `authorize(event, createVenueFeature)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),      // 'Name is required'
  description: z.string().optional(),
  icon:        z.string().optional(),  // emoji or icon class name
}
```

**Response** `200` — the created row. **Errors** `400 Feature with this name already exists`; `403`; `500 Failed to create venue feature`.

---

#### `GET /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.get.ts` · **Auth** **Public**

**Response** `200` — one feature row. **Errors** `400 Feature ID is required`; `404 Venue feature not found`.

---

#### `PUT /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.put.ts` · **Auth** `authorize(event, updateVenueFeature)` — ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon:        z.string().optional().nullable(),
}
```

An empty body returns the existing row with `200`.

**Response** `200` — the updated row. **Errors** `400 Feature ID is required`; `404 Venue feature not found`; `400 Feature name is already taken`; `403`; `500 Failed to update venue feature`.

---

#### `DELETE /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.delete.ts` · **Auth** `authorize(event, deleteVenueFeature)` — **ADMIN only**

**Response** `200` — `{ message: 'Venue feature deleted successfully' }`

**Errors** `400 Feature ID is required`; `404 Venue feature not found`; `403`.

**Side effects** `venues_to_features` rows cascade, so the feature silently disappears from every venue that had it. There is no warning and no usage count.

---

### 3.9 What's On

These two endpoints are the customer-safe view of the programme. Unlike `/api/shows`, they filter to `PUBLISHED` shows and future `ON_SALE` performances.

---

#### `GET /api/whats-on`

**Source** `server/api/whats-on/index.get.ts` · **Auth** **Public**

**Query** none.

**Response** `200` — published shows that have at least one `ON_SALE` performance starting after "now", sorted by earliest performance date. Shows with no qualifying performance are dropped. Returns `[]` when nothing is on.

```jsonc
[{
  "id": "…", "slug": "…", "title": "…", "subtitle": "…", "description": "…",
  "posterUrl": "…", "status": "PUBLISHED", …,
  "performances": [{
    "id": "…", "startsAt": "…", "doorsAt": "…", "durationMinutes": 90,
    "intervalCount": 1, "intervalMinutes": 15, "status": "ON_SALE",
    "notes": "…",                                   // internal notes are still present here
    "venue": { "id": "…", "name": "…", "capacity": 70 },
    "ticketsSold": 12,
    "capacity": 70                                  // capacityOverride ?? venue.capacity ?? null
  }]
}]
```

`ticketsSold` comes from `countOccupiedSeats`, the same rule the capacity check uses, so the sold-out badge and the booking path always agree. Show and performance rows are projected through the allow-lists in `server/utils/queries/whatsOn.ts` — the internal `notes` column is **not** returned.

---

#### `GET /api/whats-on/:slug`

**Source** `server/api/whats-on/[slug].get.ts` · **Auth** **Public**

Looked up by `slug` **and** `status = 'PUBLISHED'`, so a DRAFT show is a 404 on this route (it is still fully visible via `GET /api/shows`).

**Response** `200` — the show with every future `ON_SALE` performance, each carrying the **full venue row** (including `address`, `description`, `imageUrl`) plus:

```jsonc
{
  "ticketTypes": [                       // active + sellable types only, cheapest first
    { "id": "…", "name": "Student", "description": null, "effectivePrice": 500, "active": true }
  ],
  "ticketsSold": 12,
  "capacity": 70,                        // capacityOverride ?? venue.capacity ?? null
  "isSoldOut": false                     // capacity !== null && ticketsSold >= capacity
}
```

Unlike the other `available-ticket-types` endpoints, this one **filters out inactive ticket types** and sorts by `effectivePrice` ascending — it feeds the public booking form directly. `isSoldOut` is always `false` when capacity is unknown.

**Errors** `400 Show slug is required`; `404 Show not found`.

---

### 3.9a Rota

The rota is a control as well as a rostering tool: a confirmed shift is what scopes the show night
screen, and later the access-needs visibility rule ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md),
[ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)). Design:
[12-access-and-staffing](./12-access-and-staffing-design.md) §3.

**No shift endpoint returns an email address.** `FRONT_OF_HOUSE` holders read these, so the column
allow-list is name and id only.

---

#### `GET /api/shifts`

**Source** `server/api/shifts/index.get.ts` · **Auth** `authorize(event, listShifts)` — staff, or any holder of `foh.work`

```ts
{
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // inclusive, Europe/London
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}
```

Bounded by the performance's own `startsAt`, so the bound-parameter count does not grow with the
number of rows covered ([ADR-0006](./decisions/0006-d1-bound-parameter-limit.md)). Cancelled
performances are excluded.

**Response** `200` — a bare array of shifts, each carrying its performance, show title and venue
name. Not paginated: the window bounds it.

---

#### `GET /api/shifts/unstaffed`

**Source** `server/api/shifts/unstaffed.get.ts` · **Auth** `authorize(event, listShifts)`

```ts
{ days: z.coerce.number().int().min(1).max(90).optional().default(7) }
```

On-sale performances starting within `days` that have **no confirmed duty manager**, oldest first.
This is what the admin screen's warning renders. Scoped by a correlated `NOT EXISTS`, never an id
list.

**Response** `200` — a bare array of `{ performanceId, startsAt, showId, showTitle, venueName }`.

---

#### `GET /api/performances/:id/shifts`

**Source** `server/api/performances/[id]/shifts/index.get.ts` · **Auth** `authorize(event, listShifts)`

**Response** `200` — the performance's slots, ordered by role then creation, each with
`userId` and `userName` (null on an open slot).

---

#### `POST /api/performances/:id/shifts`

**Source** `server/api/performances/[id]/shifts/index.post.ts` · **Auth** `authorize(event, manageShifts)` — `shift.manage`

```ts
{
  role:   z.enum(['DUTY_MANAGER','DOOR','BAR']),
  userId: z.string().min(1).optional(),        // omit for an open slot
  notes:  z.string().max(500).optional(),
}
```

Giving a `userId` assigns **and confirms** in one step: an assignment by a manager is not a claim
awaiting confirmation. A second confirmed duty manager is refused with `409` before it reaches the
partial unique index, so staff see a sentence rather than a constraint error.

**Response** `200` — the created row. `404` if the performance, or the assignee's mirror row, does
not exist.

---

#### `PUT /api/shifts/:id`

**Source** `server/api/shifts/[id]/index.put.ts` · **Auth** `authorize(event, manageShifts)`

```ts
{
  userId: z.string().min(1).nullable().optional(),   // null empties the slot
  status: z.enum(['OPEN','CLAIMED','CONFIRMED','DECLINED']).optional(),
  notes:  z.string().max(500).nullable().optional(),
}
```

`userId` and `status` are resolved **together**, not independently: emptying a slot returns it to
`OPEN`, and filling an open one confirms it. The database pairs the two with a check constraint, so
a caller cannot set a status the user column contradicts.

Any manager edit clears `needsEligibilityReview` — that review is exactly what the flag was asking
for ([ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)).

**Response** `200` — the updated row. `409` on a second confirmed duty manager.

---

#### `DELETE /api/shifts/:id`

**Source** `server/api/shifts/[id]/index.delete.ts` · **Auth** `authorize(event, manageShifts)`

Removes the slot outright. A shift is a plan, not a sales record, so this is a real delete rather
than an archive ([ADR-0010](./decisions/0010-archive-never-delete-referenced-records.md) covers
referenced records; nothing references a shift).

**Response** `200` — `{ ok: true }`. `404` if it does not exist.

---

### 3.10 Admin

Both admin endpoints declare their ability **inline** rather than importing from `shared/utils/abilities/`:

```ts
await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))
```

Effective access is ADMIN or MANAGER. BOX_OFFICE is excluded. If you add another admin endpoint, consider promoting this into a named ability instead of repeating it.

---

#### `GET /api/admin/reservation-counts`

**Source** `server/api/admin/reservation-counts.get.ts` · **Auth** `authorize(event, listReservations)` — staff

Reservation totals by status, as one `GROUP BY` returning at most five rows. It backs the box-office status pills, which would otherwise be five `filter().length` passes over every reservation in the browser.

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `performanceId` | string, optional | Count one performance |
| `showId` | string, optional | Count every performance of one show, via a subquery ([ADR-0006](decisions/0006-d1-bound-parameter-limit.md)) |

Both are optional; with neither, the counts cover every reservation.

**Response** `200` — `byStatus` always carries all five keys, zero-filled, so a caller need not handle a missing status:

```jsonc
{ "byStatus": { "PENDING": 12, "COLLECTED": 40, "DOOR": 3, "CANCELLED": 1, "NO_SHOW": 0 }, "total": 56 }
```

---

#### `GET /api/admin/stats`

**Source** `server/api/admin/stats.get.ts` · **Auth** inline ability — ADMIN or MANAGER

**Query** none.

**Response** `200`

```jsonc
{
  "activeShows": 4,                 // count of shows with status PUBLISHED
  "upcomingPerformances": 11,       // ON_SALE and startsAt > now
  "totalRevenuePence": 148900,
  "totalTicketsSold": 213,
  "reservationsByStatus": [ { "status": "PENDING", "count": 42 } ],
  "revenueByShow": [{
    "showId": "…", "showTitle": "…", "showStatus": "PUBLISHED",
    "totalRevenuePence": 92400, "totalTickets": 132
  }],
  "recentReservations": [ /* 10 newest, with user, performance → show + venue */ ]
}
```

**Revenue definition — get this right when reporting to the treasurer.** Revenue and `totalTicketsSold` count only tickets whose reservation status is `COLLECTED` or `DOOR`, and whose `refundedAt` is null. `PENDING` reservations are pre-bookings where no money has changed hands and are deliberately excluded, as are `CANCELLED` and `NO_SHOW`. `reservationsByStatus`, by contrast, counts **all** statuses. `revenueByShow` is ordered by revenue descending and only includes shows with at least one qualifying ticket.

`recentReservations` are the ten most recently created, regardless of status, with `user` (id, name, email) and `performance` → `show` (id, title) and `venue` (id, name). There are no `tickets` on these entries.

**Errors** `403` for BOX_OFFICE and everyone else.

---

#### `GET /api/admin/export/tickets`

**Source** `server/api/admin/export/tickets.get.ts` · **Auth** inline ability — ADMIN or MANAGER

```ts
// query schema
{
  showId:        z.string().optional(),
  performanceId: z.string().optional(),
  from:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}
```

`performanceId` **takes precedence** over `showId`: when both are supplied the query filters on the performance alone, though the download filename is still derived from `showId`. `from` and `to` are inclusive performance-date bounds, whole days in `Europe/London`.

**`400`** if none of the four is supplied — the whole archive is too large to build in one request. **`400`** again if the filters still match more than 20,000 tickets, which the CSV is assembled in memory in a single Worker.

**Response** `200` — a CSV body, not JSON, with:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="nnt-tickets-<slug>-<YYYY-MM-DD>.csv"`, where `<slug>` is `perf-<first 8 chars of performanceId>`, `show-<first 8 chars of showId>`, or `<from|start>-to-<to|end>`.

Columns, in order:

| # | Header | Notes |
| --- | --- | --- |
| 1 | Booking Ref | |
| 2 | Status | Reservation status, all five values included |
| 3 | Refunded | `Yes` / `No`, per individual ticket |
| 4 | Customer Name | |
| 5 | Customer Email | |
| 6 | Show | |
| 7 | Performance Date | `dd Mmm yyyy`, `Europe/London` |
| 8 | Performance Time | 24-hour `HH:mm`, `Europe/London` |
| 9 | Venue | |
| 10 | Ticket Type | |
| 11 | Price Paid (£) | Pence converted to pounds, two decimals |
| 12 | Booked At | Raw `reservations.createdAt` string |
| 13 | Customer Notes | |
| 14 | Staff Notes | Internal notes are included in the export |

One row per ticket, ordered by show title, then performance start, then booking reference. Cells containing a comma, quote, or newline are quoted with doubled inner quotes. **Every reservation status is included** — cancelled and no-show rows appear too — so the treasurer has a full audit trail; filter on the Status and Refunded columns rather than assuming the file is a revenue report.

When `showId` matches a show with no performances, an empty CSV (headers only) is returned with the generic filename `nnt-tickets.csv`.

**Errors** `403`; `400` on a non-string query value.

**Side effects** None — read-only. The whole file is built in memory as a single string, so a very large export is bounded by Worker memory.

---

### 3.10a Health

---

#### `GET /api/health`

**Source** `server/api/health.get.ts` · **Auth** **Public** — no `authorize()`, no `requireUserSession()`

The one endpoint in this app where an unguarded handler is deliberate rather than a bug: uptime
monitoring cannot hold a session, and the response carries no personal data. Everywhere else in this
document, a missing guard means an open endpoint.

It compares the migration journal compiled into the running build against the `_hub_migrations`
ledger in the database.

**Response** `200` when they agree:

```json
{ "ok": true }
```

**Response** `503` when the schema is behind the deployed code, naming the files:

```json
{ "ok": false, "pendingMigrations": ["0017_rich_husk"] }
```

Three details that are load-bearing:

- **Both ledger spellings are folded together.** `nuxt-db migrate` records the bare tag,
  `wrangler d1 migrations apply` records it with `.sql`, and production carries a mix. Which
  spelling a row has says nothing about whether it ran.
- **A missing `_hub_migrations` table means everything is pending**, not an error. Nothing has ever
  been applied against that database.
- **The ledger is read with raw SQL.** NuxtHub owns that table, so declaring it in the Drizzle
  schema would make `nuxt db generate` try to create it.

Why it exists rather than returning a bare `ok`: migrations apply from CI but cannot be sequenced
against the deploy, so the ordering is a race won on timing
([08-operations](./08-operations.md) §5). This is the alarm for the case where it is lost, and it is
the second half of stage-door ADR-0021 — the first half being the workflow this repo already had.
### 3.10a2 Show night

---

#### `GET /api/foh/tonight`

**Source** `server/api/foh/tonight.get.ts` · **Auth** `authorize(event, workFoh)` — `foh.work`

The scope the `/foh` screen renders. The role gets you the endpoint; **the rota decides what is in
it** ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).

**Response** `200`:

```ts
{
  night: string                 // `YYYY-MM-DD`, the show night this instant belongs to
  performances: Array<{
    id, startsAt, doorsAt, showTitle, showSlug, venueName,
    shiftRole: 'DUTY_MANAGER' | 'DOOR' | 'BAR' | null   // the caller's own confirmed role
  }>
  bypassedRota: boolean         // true for BOX_OFFICE and above
  rosteredOnNothing: boolean    // true when they could work tonight but hold no shift
}
```

Three behaviours worth knowing:

- **A `FRONT_OF_HOUSE` holder sees only performances they are `CONFIRMED` on, tonight.** Not
  rostered is an empty list with `rosteredOnNothing: true`, never an error: the screen says so, and
  the resolver returns data rather than throwing (the same reasoning as
  [ADR-0008](./decisions/0008-roles-go-stale-identity-does-not.md)).
- **`BOX_OFFICE` and above see every performance tonight**, with `bypassedRota: true` and
  `shiftRole: null` where they hold no shift of their own.
- **The night rolls over at 04:00**, not midnight, so a screen open at 00:30 still shows the night
  that is ending. `showNightDate()` in `server/utils/foh.ts` is the only definition of that.

Anyone without `foh.work` gets `403`, including anonymous callers — `defineAbility` with a single
argument denies guests (§1).

---

#### `GET /api/foh/lookup`

**Source** `server/api/foh/lookup.get.ts` · **Auth** `authorize(event, workFoh)` — `foh.work`

```ts
{ q: z.string().trim().min(2).max(100) }
```

A six-character alphanumeric `q` is matched as an exact booking reference; anything else searches
customer name and email. At most 10 results.

**Scoped to tonight, and to the caller's own shifts.** Both scopes are subqueries, never id lists
([ADR-0006](./decisions/0006-d1-bound-parameter-limit.md)), and the tickets come from a second query
filtered by the *same predicate* rather than by the ids just returned, for the same reason.

**The response shape depends on the role**, and this is the part to preserve:

| | `FRONT_OF_HOUSE` | `BOX_OFFICE` and above |
|---|---|---|
| `standing.state`, `standing.partySize` | ✅ | ✅ |
| `standing.amountOwedPence` | — | ✅ |
| `firstName` | ✅ | — |
| `customerName`, `customerEmail` | — | ✅ |
| `tickets` with `pricePaid` | — | ✅ |

The door's job is admit or redirect, so it gets the verdict and the head count and **no money at
all, including what is owed** — that figure is the bar's
([11-show-night-screen-design](./11-show-night-screen-design.md) §2.1). Allow-listed rather than
deleted, so a column added later is private until someone decides otherwise.

`standing` comes from `bookingStanding()`, the single definition of paid versus unpaid
([ADR-0011](./decisions/0011-collection-is-the-payment-boundary.md)). The bar till will call the
same function; do not write a second one.

**Response** `200` — an array, possibly empty. A booking for another night is simply not found here,
which is deliberate: the rota scope is a boundary, not a convenience.

---

#### `GET /api/foh/glance`

**Source** `server/api/foh/glance.get.ts` · **Auth** `authorize(event, workFoh)` — `foh.work`

`{ performanceId }`, scoped like every other show-night route.

Returns `numbers` and `show`. **Every seat figure goes through `countOccupiedSeatsFor()`**
([ADR-0007](./decisions/0007-one-seat-counting-rule.md)) — a second count here would be a second
definition of a full house. `collected` narrows the same set by reservation status rather than
counting seats a different way.

`capacity` is `capacityOverride ?? venue.capacity`, and **`null` means uncapped, not zero**. The
screen renders that as `∞` and says walk-ups are a judgement call: reading it as "no room" would
turn people away from a half-empty house.

`show` carries running time, interval structure, age guidance, latecomer policy and content
warnings. Where warnings are absent the response distinguishes *confirmed none* from *not recorded*,
because the door should say which it is rather than guess.

---

#### `GET /api/foh/emergency`, `GET /api/foh/contacts`, `GET|POST /api/foh/incidents`

**Source** `server/api/foh/*` · **Auth** `authorize(event, workFoh)` — `foh.work`

All take a `performanceId` and run it through `scopedPerformance()`, which **404s anything not in
tonight's scope**. A performance id from elsewhere is not a way round the rota, so the check is one
function and every show-night route calls it
([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).

- **`emergency`** returns the venue's card, or `null` where none is recorded. A venue with no card
  still answers: nothing on this path is worth a failed request, because it is the one screen that
  has to work when everything else is going wrong.
- **`contacts`** returns `{ onTonight, contacts }`. `onTonight` is **names and roles only** — the
  mirror holds no phone numbers, and a colleague's email is not the door's business. The numbers
  come from the admin list.
- **`incidents`** lists in reverse order, and `POST` appends. **There is deliberately no update or
  delete route**, and the database refuses both anyway (migration `0019`). A correction is a new
  entry carrying `supersedesId`; both stay, in order
  ([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)).

#### `/api/admin/foh/**`

**Auth** `authorize(event, manageFohReference)` — `foh.manage`, held by `ADMIN`, `MANAGER` and
`FOH_MANAGER`.

The emergency card is upserted per venue, so a first save and an edit are the same call. Contacts
are **archived, never deleted**: a number that was on the card during an incident should still be
findable afterwards ([ADR-0010](./decisions/0010-archive-never-delete-referenced-records.md)).

---

### 3.10b Short booking links

---

#### `GET /t/:ref`

**Source** `server/routes/t/[ref].get.ts` · **Auth** **Public**

The short, readable form of a booking handle, and what the QR on a confirmation email encodes
([11-show-night-screen-design](./11-show-night-screen-design.md) §3). It resolves the reference to
its show and redirects to the canonical booking page:

```
GET /t/5T3P7T  →  302  /whats-on/importance-of-being-earnest/booking/5T3P7T
```

**The reference grants nothing.** This route performs no access check and confers no access; the
booking page and `GET /api/bookings/:id` apply the same rules they always did
([ADR-0009](./decisions/0009-signed-booking-access-tokens.md)). Following this redirect without a
token or an owning session ends in the same refusal as visiting the page directly. `?ref=` is still
not an accepted credential anywhere.

If a valid `?t=` token is present it is **moved into the `nnt_booking_token` cookie and dropped from
the URL**, so the redirect's `Location` never carries it. That is strictly better than the link in
today's confirmation email, which leaves the token in the address bar until the page hands it off.
An invalid or expired token is ignored rather than refused, because the booking page explains the
problem better than a bare 404 does.

References are matched case-insensitively, so a reference read aloud and typed in lower case works.

**Response** `302` to the booking page, or `404` if no booking has that reference. Rate limited as
`booking-shortlink` (60 per 10 minutes): an unknown reference 404s, which makes this an existence
oracle over a six-character space, so it is capped like the other public booking routes
([ADR-0015](./decisions/0015-rate-limits-declared-in-middleware.md)).

---

### 3.11 Media

#### `GET /images/**`

**Source** `server/routes/images/[...pathname].get.ts` · **Auth** **Public — no `authorize()`**

The only handler outside `server/api/`. Streams an object out of the Cloudflare R2 bucket (`proscenium-blob`) by pathname, e.g. `/images/shows/abc123/image-1712345678.jpg` serves the blob at `shows/abc123/image-1712345678.jpg`.

**Response** `200` — the raw object with its stored content type, plus `Content-Security-Policy: default-src 'none';` to neutralise any HTML or script that reaches the bucket. `404` when the pathname does not exist.

**Side effects** None. Anything written to the bucket is publicly readable by anyone who knows or guesses the pathname — uploads are stored with `access: 'public'`. Do not put anything sensitive in blob storage.

---

## 4. Cross-cutting notes for maintainers

**Nothing is transactional.** Every multi-step write — create reservation then insert tickets, create user then insert roles, replace venue features — runs as separate statements. A failure midway leaves partial state. If you are adding a multi-row write, consider whether an orphan is tolerable.

**Capacity is enforced in exactly one place.** `POST /api/bookings` is the only handler that checks it, and it does so with a non-atomic read-then-write. `POST /api/reservations` and `PUT /api/reservations/:id/tickets` do not check at all. `isSoldOut` on `/api/whats-on/:slug` is presentational.

**Emails are sent from five places:** registration and verification requests, password resets (self-service, admin-triggered, and new-user), booking confirmation (`POST /api/bookings`), and booking cancellation (`PUT /api/reservations/:id` on the transition into `CANCELLED`). The two booking emails are fire-and-forget with `waitUntil`; all the others are awaited and will fail the request with a 500 if Resend is down.

**Email links depend on `runtimeConfig.public.baseUrl`,** which the email helpers read as `baseUrl` while `nuxt.config.ts` defines `baseURL`. Check that the deployed environment actually sets the key the helper reads before trusting any emailed link.

**`server/utils/` is auto-imported.** `authorize`, `allows`, `db`, `schema`, `createError`, `getUserSession`, `requireUserSession`, `hashPassword`, `verifyPassword`, plus everything in `server/utils/*.ts` (`sendEmail`, `validateAndUploadImage`, `loadTicketPriceContext`, `resolveEffectivePrice`, `formatUserResponse`, `reservationDetailWith`, …) are available without an import statement. Abilities are the exception: they are imported explicitly from `~~/shared/utils/abilities`.

**Restrict-vs-cascade, at a glance.** Deletes that cascade: show → performances → their overrides; ticket type → its overrides; user → roles, verification and reset tokens; venue → feature links; feature → venue links. Deletes that are *restricted* by a foreign key and will therefore fail: anything with issued `tickets` (performance, ticket type, reservation) and any user with a reservation. Only the performance and ticket-type delete handlers convert that failure into a friendly 409; the rest surface as a 500.
