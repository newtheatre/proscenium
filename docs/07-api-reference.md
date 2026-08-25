# API Reference

Complete reference for the HTTP API exposed by Proscenium, the Nottingham New Theatre website and box office.

Everything here was transcribed from the handler source in `server/api/` and `server/routes/`. If the code and this document disagree, the code wins: please fix the document.

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

When `schema.parse` throws, h3 converts the `ZodError` into a **400** with `statusMessage: 'Validation Error'`, a `message` carrying Zod's summary, and the full issue list in `data`. Individual endpoint sections below do not repeat this, assume every documented schema can produce a 400 on malformed input.

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
| 404 | Row not found: also used for "no override exists" and "this show has no poster" |
| 409 | Conflict: not enough capacity, or a delete blocked by a foreign key |
| 500 | Insert/select returned nothing unexpectedly, blob deletion failed, or an email failed to send |

### Authorisation

Two independent mechanisms are in play.

**`requireUserSession(event)`**: from `nuxt-auth-utils`. Throws **401 Unauthorized** when there is no session cookie. Used by handlers that need to know who is asking and then check the rota or the till rather than a role.

**`requireSessionUser(event)`** (`server/utils/session.ts`): the same 401, but through `sessionUserForAuthorization`, so the handler gets a user whose stale roles have already been stripped ([ADR-0008](decisions/0008-roles-go-stale-identity-does-not.md)). `GET /api/bookings/my` uses this one.

**`authorize(event, ability, ...args)`**: from `nuxt-authorization`. Resolves the session user via the Nitro plugin in `server/plugins/authorization-resolver.ts`, then runs the ability. Abilities live in `shared/utils/abilities/` and are re-exported from the barrel `shared/utils/abilities/index.ts`:

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

The three roles are `ADMIN`, `MANAGER`, `BOX_OFFICE`. They arrive **namespaced** on the session as `proscenium:ADMIN` and friends, because one estate session carries every app's roles: `hasRole` adds the prefix for you. Never compare against a bare role name. A user with no `proscenium:` role is a plain customer.

**Roles go stale.** A session whose `refreshedAt` is older than 15 minutes has its `proscenium:` roles dropped for authorization purposes, so staff abilities fail closed until the browser refreshes through the auth service. See [04-auth-and-permissions](./04-auth-and-permissions.md).

**Two things about `authorize()` that are easy to get wrong:**

1. **It always requires a session.** Every ability in this repo is declared with the single-argument form `defineAbility(fn)`, which sets `allowGuest: false`. `nuxt-authorization` short-circuits to *denied* when the resolved user is `null`, *before* the ability body runs. So abilities whose body is `() => true` (`readShow`, `listShows`, `readTicketType`, `listVenues`, and friends) do **not** mean "public" when passed to `authorize()`. They mean "any logged-in user, regardless of role". The genuinely public endpoints achieve that by not calling `authorize()` at all.
2. **Denial is a 403, not a 401,** and the payload comes from the library rather than from `createError` in the handler: `statusCode: 403` with `message: 'Unauthorized'`. Do not pattern-match on `statusMessage` for authorisation failures.

`allows(event, ability)` is the non-throwing sibling. Note that `authorize()` **swallows any non-`AuthorizationError` thrown while resolving the user** and then resolves successfully, which is why `sessionUserForAuthorization` must never throw. See [04-auth-and-permissions](./04-auth-and-permissions.md#staleness-not-epochs).

> **Any handler with no `authorize()` and no `requireUserSession()` call is fully public**: reachable by anyone on the internet, unauthenticated. That includes `POST /api/bookings`, `GET /api/bookings/:id` (via a signed `?t=` token), all of `/api/whats-on`, `/api/venues` and `/api/venue-features` reads, `/api/ticket-types` reads, and `/images/**`. `GET /api/shows` and `GET /api/shows/:id` are **not** in that list any more: they now call `authorize()`, because they return DRAFT productions.

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

130 handler files under `server/api/` (counted 2026-08-21), plus the blob route, `/t/:ref` and the
dev-only login under `server/routes/`. The figure in an earlier revision of this document said
69, which was already behind the code: prefer `find server/api -name '*.ts' | wc -l` to the
number written here.

There are **no `/api/auth/*` endpoints**. Registration, login, logout, verification and password reset all live at `auth.newtheatre.org.uk`: this app reads the shared session cookie and never writes it. Anything in an older copy of this document describing `POST /api/auth/login` and friends is describing code that was deleted at the stage-door cutover.

In the Auth column, **Public** means no `authorize()` and no `requireUserSession()`; **Any user** means `authorize()` with a permissive ability (so login required, role irrelevant); **Staff** means ADMIN, MANAGER, or BOX_OFFICE.

### Service hooks (called by the auth service)

Authenticated by the SHA-256 of this app's `AUTH_SERVICE_TOKEN`, compared constant-time. Not reachable by a browser session.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/_hooks/auth/export` | Service token | This app's contribution to a subject-access bundle |
| POST | `/api/_hooks/auth/anonymise` | Service token | GDPR erasure: scrub the mirror row and every free text keyed to the subject. Tombstones a user this app never mirrored. Idempotent |
| POST | `/api/_hooks/auth/last-activity` | Service token | Most recent booking or pass per user, feeding the retention sweep |
| POST | `/api/_hooks/auth/merge` | Service token | Account merge: re-point every user-referencing row onto the winner, delete the losing mirror row. Idempotent |
| GET | `/api/_hooks/auth/manifest` | Service token | This app's role and permission declaration, polled by the auth service (stage-door ADR-0017) |

### The app manifest

`GET /api/_hooks/auth/manifest` returns `shared/utils/appManifest.ts` verbatim: the role namespace
(`proscenium`), the roles this app reads, and the permissions each carries. The auth service polls it
and turns it into role definitions, so **adding a role here is what makes it grantable**: nobody
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
| POST | `/api/bookings` | Public | Public booking flow: capacity-checked, sends a confirmation email |
| GET | `/api/bookings/my` | Logged in | One page of the current user's bookings, upcoming or past |
| GET | `/api/passes/mine` | Signed in | The holder's own passes, what they cover and what has been used |
| POST | `/api/passes/mine/redeem` | Signed in, own pass | Book a seat on your own pass |
| GET | `/api/pass-types/on-sale` | Public | What a member may ask for |
| POST | `/api/passes/mine/requests` | Signed in | Ask for a pass. Creates no pass |
| GET | `/api/pass-requests` | `passes.issue` (`issuePass`) | The box office queue |
| POST | `/api/pass-requests/:id/fulfil` | `passes.issue` (`issuePass`) | Paid in person: issue the pass |
| POST | `/api/pass-requests/:id/decline` | `passes.issue` (`issuePass`) | No, and no pass is created |
| GET | `/api/bookings/my-options` | Optional session | What this account adds to the public picker |
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
| POST | `/api/reservations/:id/refund` | ADMIN/MANAGER (`refundTicket`) | Refund n tickets of a type. Collected bookings, or a cancelled one still holding money |
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
| GET | `/api/users/:id/summary` | Staff or self (`readUser`) | Everything this app knows about one person's relationship with it |
| GET | `/api/users/:id` | Staff or self (`readUser`) | One mirror user |
| DELETE | `/api/users/:id` | ADMIN (others) or self (`deleteUser`) | Delete the mirror row; refuses if anything references it |

Credentials, roles, verification and erasure are the auth service's: there is no `PUT /api/users/:id`
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
| POST | `/api/shifts/stamp` | `shift.manage` (`manageShifts`) | Stamp the template onto performances with no shifts |
| GET | `/api/shifts/mine` | Any logged-in member | Upcoming performances, their open slots, and who is on |
| POST | `/api/shifts/:id/claim` | Any logged-in member | Take an open slot, subject to training |
| POST | `/api/shifts/:id/release` | The claimant | Give back a claim, before it is confirmed |
| GET/PUT | `/api/shifts/settings` | `listShifts` / `shift.manage` | Whether claims auto-confirm this season |
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
| POST | `/api/foh/performances/:id/close` | Tonight's `DUTY_MANAGER`, or `BOX_OFFICE`+ | Sign the night off: file the report, revoke the codes, email it. A failed email is logged, not raised |
| GET | `/api/foh/performances/:id/report` | `foh.work`, scoped to tonight | The stored record, if the night is closed |
| GET | `/api/foh/access-tonight` | `foh.work` + the §2.5 rule | Consented access needs for this performance |
| GET | `/api/foh/backstage` | `foh.work` + rostered tonight | Tonight's backstage code, its QR, and the joined devices |
| POST | `/api/foh/backstage/reset` | `foh.work` + rostered tonight | The kill switch: rotate the code, sign every device out |
| POST | `/api/backstage/join` | **Public** | Join tonight's board with the code. Rate limited, and self-rotating |
| GET | `/api/backstage/session` | Backstage cookie | Is this device still joined? |
| GET | `/api/backstage/board` | Backstage cookie | The board, the presets and the house count. Polled |
| POST | `/api/backstage/messages` | Backstage cookie | Send a preset or free text |
| POST | `/api/backstage/messages/:id/ack` | Backstage cookie | Acknowledge a front-of-house call |
| GET | `/api/foh/backstage/board` | `foh.work` + rostered tonight | The front-of-house side of the board. Polled |
| POST | `/api/foh/backstage/messages` | `foh.work` + rostered tonight | Call something through to backstage |
| POST | `/api/foh/backstage/messages/:id/ack` | `foh.work` + rostered tonight | Acknowledge a backstage call |
| GET | `/api/backstage/emergency` | **Public** | Tonight's emergency cards, with the night they are for. Public on purpose |
| GET | `/api/foh/emergency` | `foh.work` (`workFoh`) | The venue's emergency card for a performance |
| GET | `/api/foh/contacts` | `foh.work` (`workFoh`) | Who is on tonight, and the numbers to call |
| GET | `/api/foh/incidents` | `foh.work` (`workFoh`) | The incident log for a performance |
| GET | `/api/foh/age-checks` | `foh.work` + a `BAR` shift | Tonight's Challenge 25 register and its two counters |
| POST | `/api/foh/age-checks` | `foh.work` + a `BAR` shift | Record an ID check. **There is no update or delete** |
| GET | `/api/bar/tonight` | `foh.work` + a `BAR` shift | The till's opening state: session, products, prices, discounts, training |
| GET | `/api/bar/lookup` | `foh.work` + a `BAR` shift | Find a booking to take payment for. **Not night-scoped** |
| POST | `/api/bar/sessions` | `foh.work` + a `BAR` shift | Open the bar for tonight |
| POST | `/api/bar/transactions` | `foh.work` + a `BAR` shift | One tap, one transaction, one figure. `CARD` or `TAB` |
| GET | `/api/bar/tabs/menu` | `bar.tab` (`runBarTab`) | What you may put on a tab, and what you owe |
| POST | `/api/bar/tabs` | `bar.tab` (`runBarTab`) | Put your own snack on your own tab |
| GET | `/api/bar/tabs/mine` | `bar.tab` (`runBarTab`) | Your outstanding and settled charges |
| GET | `/api/bar/tabs/holders` | `foh.work` + a `BAR` shift | Everyone who may run a tab, with what they owe |
| GET | `/api/bar/tabs/debtor` | `foh.work` + a `BAR` shift | Fallback lookup by **exact email** |
| POST | `/api/bar/tabs/settle` | `foh.work` + a `BAR` shift | Clear someone's tab at the counter |
| POST | `/api/bar/tabs/:id/void` | the debtor, or `bar.manage` | Take an unsettled charge back off a tab |
| GET | `/api/admin/bar/tabs` | `bar.manage` (`manageBar`) | Who owes what, biggest first |
| GET | `/api/admin/bar/tabs/:userId` | `bar.manage` (`manageBar`) | One person's tab, itemised |
| POST | `/api/admin/bar/tabs/settle` | `bar.manage` (`manageBar`) | Clear a tab away from the till |
| GET | `/api/bar/comps` | `foh.work` + a `BAR` shift **or** approver | Your own requests, and the approver's queue |
| POST | `/api/bar/comps` | `foh.work` + a `BAR` shift | Ask for a comp. Records nothing |
| POST | `/api/bar/comps/:id/approve` | Tonight's `DUTY_MANAGER`, or `BOX_OFFICE`+ | The approval writes the record |
| POST | `/api/bar/comps/:id/decline` | Tonight's `DUTY_MANAGER`, or `BOX_OFFICE`+ | No, and nothing is recorded |
| GET | `/api/admin/bar/reconciliation` | `bar.manage` (`manageBar`) | What the reader's daily total should read |
| GET | `/api/admin/bar/stock` | `bar.manage` (`manageBar`) | On-hand, par flags and value, all derived |
| POST | `/api/admin/bar/stock/adjust` | `bar.manage` (`manageBar`) | Wastage, transfers and corrections |
| GET | `/api/admin/bar/deliveries` | `bar.manage` (`manageBar`) | What came in |
| POST | `/api/admin/bar/deliveries` | `bar.manage` (`manageBar`) | Stock in, with the movements it causes |
| POST | `/api/admin/bar/stocktakes` | `bar.manage` (`manageBar`) | Start a count |
| GET | `/api/admin/bar/stocktakes/:id` | `bar.manage` (`manageBar`) | The count sheet and its variance |
| PATCH | `/api/admin/bar/stocktakes/:id/lines` | `bar.manage` (`manageBar`) | Record counts as they happen |
| POST | `/api/admin/bar/stocktakes/:id/finish` | `bar.manage` (`manageBar`) | Apply the count as movements |
| POST | `/api/admin/bar/stocktakes/:id/abandon` | `bar.manage` (`manageBar`) | Walk away, writing nothing |
| GET | `/api/admin/bar/reports/term` | `bar.manage` (`manageBar`) | What the date pickers should open on |
| GET | `/api/admin/bar/reports/sales` | `bar.manage` (`manageBar`) | Sales by product, category or month |
| GET | `/api/admin/bar/reports/discounts` | `bar.manage` (`manageBar`) | By type, and by who rang it up |
| GET | `/api/admin/bar/reports/comps` | `bar.manage` (`manageBar`) | By reason, with requester and approver |
| GET | `/api/admin/bar/reports/gp` | `bar.manage` (`manageBar`) | Margin per product at the latest cost |
| GET | `/api/admin/bar/reports/variance` | `bar.manage` (`manageBar`) | Stocktake variance over time |
| GET | `/api/admin/bar/reports/age-checks.pdf` | `bar.manage` (`manageBar`) | The Challenge 25 register, as a PDF |
| GET | `/api/admin/bar/catalogue` | `bar.manage` (`manageBar`) | Categories, products and today's prices |
| POST | `/api/admin/bar/categories` | `bar.manage` | Add a category |
| POST | `/api/admin/bar/products` | `bar.manage` | Add a product, with its first price |
| PATCH | `/api/admin/bar/products/:id` | `bar.manage` (`manageBar`) | Edit or retire a product |
| GET | `/api/admin/bar/products/:id/prices` | `bar.manage` (`manageBar`) | The price history, newest first |
| PATCH | `/api/admin/bar/categories/:id` | `bar.manage` (`manageBar`) | Rename or reorder |
| PATCH | `/api/admin/bar/discounts/:id` | `bar.manage` (`manageBar`) | Edit or retire a discount |
| POST | `/api/admin/bar/products/:id/prices` | `bar.manage` | Set a price from a date. **Append only** |
| POST | `/api/admin/bar/discounts` | `bar.manage` | Add a discount the till can offer |
| GET | `/api/admin/bar/age-checks/export` | `bar.manage` (`manageBar`) | The register as CSV, for a date range |
| POST | `/api/foh/incidents` | `foh.work` (`workFoh`) | Add an entry. **There is no update or delete** |
| GET | `/api/admin/foh/emergency` | `foh.manage` | Every venue's emergency card, for editing |
| PUT | `/api/admin/foh/emergency/:venueId` | `foh.manage` | Upsert one venue's card |
| GET/POST | `/api/admin/foh/contacts` | `foh.manage` | The contact list |
| PUT | `/api/admin/foh/contacts/:id` | `foh.manage` | Edit or archive a contact |

### Short booking links

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/t/:ref` | **Public** | Short booking handle. Resolves the reference and redirects; grants nothing |

### Access requirements

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/account/access` | Any logged-in user | Your own access profile, or null |
| PUT | `/api/account/access` | Any logged-in user | Request verification, or update what you asked for |
| DELETE | `/api/account/access` | Any logged-in user | Remove it. No questions asked |
| GET | `/api/admin/access` | `access.verify` (`verifyAccess`) | Profiles to verify, waiting ones first |
| PUT | `/api/admin/access/:userId` | `access.verify` (`verifyAccess`) | Record the conclusion of a verification conversation |

#### `PUT /api/admin/access/:userId`

**Source** `server/api/admin/access/[userId]/index.put.ts` · **Auth** `authorize(event, verifyAccess)`: `access.verify`

**Not `staff.access`, and not `MANAGER`.** Selling someone a ticket is not a reason to read their
access needs, so this is a one-or-two-people privilege held by `ADMIN` and `FOH_MANAGER` only
([ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)). `BOX_OFFICE` and `MANAGER`
both get `403`.

The verifier records **the conclusion of a conversation**, never the evidence: sight of a card, a
letter or a judgement all end in the same eight symbols. There is no field, and no endpoint, that
would accept a document.

`expiresAt` follows a sighted card's own expiry where one is given, otherwise three years: the
Access Card's cycle. On `VERIFIED` the person is emailed **exactly what was recorded**, including
the note the door will see, so nothing is held about them that they have not read.

A withdrawn profile is `409`: it is not the verifier's to reinstate.

### Health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | **Public** | Uptime check. 503 naming pending migrations, or a missing session key |

---

## 3. Endpoint detail

### 3.1 Service hooks

Called by stage-door, never by a browser. Each authenticates with `Authorization: Bearer <sha256hex>`
where the value is the SHA-256 of this app's own `AUTH_SERVICE_TOKEN`: the auth service stores only
the hash, so no plaintext ever travels and the hash cannot be replayed inbound against the auth
service. Verified constant-time in `server/utils/hookAuth.ts`; anything else is a bare 401.

#### `POST /api/_hooks/auth/export`

**Source** `server/api/_hooks/auth/export.post.ts` · **Auth** Service token

**Body** `{ userId: string }`

**Returns** `{ data: { profile, reservations[], passes[] } }`, the personal data this app holds for
that person: mirror profile, every reservation with its show, performance, status, notes, ticket
count and total paid, and every pass. Empty structures rather than a 404 when the person never used
this app.

#### `POST /api/_hooks/auth/anonymise`

**Source** `server/api/_hooks/auth/anonymise.post.ts` · **Auth** Service token

**Body** `{ userId: string }` · **Returns** `{ ok: true }`

Rewrites the mirror row to `deleted-<userId>@anonymised.invalid` / `Deleted user`: byte-identical
to what stage-door writes centrally, and clears **both** `customerNotes` and `staffNotes` on every
reservation the person owns, stamping `anonymisedAt`. Bookings and ticket rows survive: attendance
and revenue statistics stay intact, the person does not.

**Idempotent**, and returns `{ ok: true }` for a user this app has never seen, because stage-door
retries until every app succeeds and an erasure is not complete until they all do.

#### `POST /api/_hooks/auth/last-activity`

**Source** `server/api/_hooks/auth/last-activity.post.ts` · **Auth** Service token

**Body** `{ userIds: string[] }` (max 500) · **Returns** `{ [userId]: epochMs | null }`

The most recent reservation or pass per user, feeding the retention sweep's guest cohort. Every
requested id appears in the response, `null` where nothing is known. Ids are chunked at 90 per query
internally: D1 binds at most 100 parameters per statement, and stage-door batches at 90 for the
same reason.

#### `POST /api/_hooks/auth/merge`

**Source** `server/api/_hooks/auth/merge.post.ts` · **Auth** Service token

**Body** `{ fromUserId: string, toUserId: string, dryRun?: boolean }` · **Returns** `{ ok: true, notMirrored, counts }`

This app's share of an estate-wide account merge (stage-door ADR-0015). Re-points
`reservations.userId`, `passes.userId`, `passes.issuedByUserId` and
`pass_admissions.redeemedByUserId` from the losing account onto the winner, then deletes the losing
mirror row: with nothing referencing it the `restrict` FKs are satisfied, and the sales record now
lives intact on the winner. `dryRun: true` returns the affected-row `counts` without writing;
stage-door shows them in its pre-merge report. Each statement binds two parameters however many rows
move, so no chunking is needed.

**The hook may mint the winner's mirror row.** A merge whose winner has never touched this app is
the ordinary case: a walk-in shadow account is the loser and the account the person later signed up
with is the winner. Nothing may point at a row that does not exist, so a minimal winner row is
inserted first, carrying a `merged-<id>@placeholder.invalid` address because the loser still holds
theirs until the batch deletes them. The last statement of that same batch, after the delete, copies
the loser's name and address onto the winner and is guarded on the row still holding the placeholder,
so a retry is a no-op. The address is real and belongs to the same person, which matters: a
`.invalid` address is filtered out of every staff listing and lookup, counted as anonymised, and used
verbatim as the send address for booking confirmations. An **anonymised** loser has no identity to
carry, so the placeholder stays and `ensureLocalUser` corrects it on the winner's next request.

**Idempotent**, and `{ ok: true, notMirrored: true }` for a losing account this app has never seen:
stage-door retries until every app succeeds.

### 3.2 Bookings

`/api/bookings` is the customer-facing half of the box office. `/api/reservations` is the staff-facing half. They write to the same `reservations` and `tickets` tables.

---

#### `POST /api/bookings`

**Source** `server/api/bookings/index.post.ts` · **Auth** **Public**: no `authorize()`, no `requireUserSession()`

```ts
{
  performanceId: z.string().min(1),

  // Required only for guests; ignored when a session is present
  name:  z.string().min(1).optional(),
  email: z.email().optional(),

  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity:     z.int().min(1).max(10),   // per line
  }))
    .min(1)                                 // 'At least one ticket is required'
    // and per booking: 'A booking is at most 10 tickets…'
    .refine(t => t.reduce((sum, x) => sum + x.quantity, 0) <= 10),

  customerNotes: z.string().optional(),
}
```

**Ten seats is the whole booking, not the line.** The array has no length limit, so without the
summed check a caller could repeat one `ticketTypeId` and take every remaining seat of a performance
in a single unauthenticated request. Duplicate `ticketTypeId` entries are still accepted and are
additive: each line creates its own ticket rows. A party larger than ten rings the box office, which
uses `POST /api/reservations` instead.

**Response** `200`: the created reservation with relations:

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

One `tickets` row is created per seat: a line of `quantity: 3` yields three rows, each with its own `pricePaid` snapshot.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Name and email are required for guest bookings` |
| 400 | `A booking is at most 10 tickets. For a larger group, please call the box office.` |
| 404 | `Performance not found or not on sale`: the lookup filters on `status = 'ON_SALE'`, so a DRAFT or CANCELLED performance is indistinguishable from a missing one |
| 400 | `Show is not currently published` |
| 400 | `This performance has already started` |
| 409 | `Not enough tickets available for this performance` |
| 400 | `Ticket type <id> not found` (from `validateTicketTypesExist`) |
| 500 | `Failed to create guest account` / `Failed to create reservation` |

**Capacity check.** `assertCapacity`: effective capacity is `performance.capacityOverride ?? venue.capacity`, and both `null` means uncapped. Occupied seats are counted by `countOccupiedSeats`, the one shared rule: non-refunded tickets on `PENDING`/`COLLECTED`/`DOOR` reservations, excluding `PASS_SALE` types (a pass purchase is not a seat, the seat is the separate `PASS_ADMISSION` ticket). Every write path calls it, including reinstating a cancelled reservation. **It remains a read-then-write with no lock**: two concurrent bookings can both pass and jointly oversell. Accepted at this volume; see [09-known-issues](./09-known-issues.md#capacity-is-still-read-then-write).

**Side effects**
- Guests are matched to an existing account by email if one exists (including a staff account: the booking is then attributed to that user); otherwise a **shadow account** is created with `password: null, verified: false`.
- Sends a booking confirmation email via Resend. The promise is *not* awaited: failures are logged, and the promise is handed to `event.context.cloudflare?.context.waitUntil()` so the Worker stays alive until it settles. The response is returned regardless.

---

#### `GET /api/bookings/my`

**Source** `server/api/bookings/my.get.ts` · **Auth** `requireSessionUser`: any logged-in user, no role needed

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `page` | int ≥ 1, default `1` | |
| `limit` | int 1..100, default `25` | |
| `upcoming` | `'true'` or `'false'`, default `'true'` | Which half to page |

**Response** `200`: the `Paginated<T>` envelope ([ADR-0005](decisions/0005-paginate-list-endpoints-in-sql.md)).

```jsonc
{ "rows": [ /* reservations */ ], "total": 42, "page": 1, "limit": 25 }
```

A booking is **upcoming** when the performance starts in the future *and* the status is not `CANCELLED` or `NO_SHOW`; everything else is **past**. The two predicates are exact complements, so no booking is in both halves or in neither. `upcoming=true` sorts by the performance's `startsAt` ascending, which is when the customer has to turn up rather than when they booked; `upcoming=false` sorts by it descending.

Each row is the **customer** shape, allow-listed by `reservationCustomerColumns` and `reservationCustomerWith` (`server/utils/queries/reservations.ts`): the reservation columns plus `user` (id, name, email), an allow-listed `performance` (so the internal `notes` column is not returned) with nested `show` (id, title, slug, posterUrl) and `venue` (id, name, address), and `tickets` ordered by `createdAt` with `ticketType` (id, name, description). It does **not** include `staffNotes` or `legacyRef`.

The upcoming/past split is a subquery over `performances`, never a bound list of ids, so the statement's parameter count does not grow with the bookings it covers ([ADR-0006](decisions/0006-d1-bound-parameter-limit.md)).

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

**`?ref=` is not an access path.** The booking reference is a customer-facing identifier (printed on emails, read aloud at the box office) and was previously accepted as a bearer credential; it is not, and must not be reintroduced as one.

A stale session keeps its identity but loses its roles, so the owner branch keeps working while the staff branch fails closed until the browser refreshes ([ADR-0008](decisions/0008-roles-go-stale-identity-does-not.md)).

Note that the booking is loaded from the database *before* the access check, so a wrong `id` yields 404 and a right `id` with no credentials yields 403, which confirms the id exists.

**Response** `200`: the **customer** shape, allow-listed by `reservationCustomerColumns`: `id`, `bookingRef`, `status`, `cancelledBy`, `customerNotes`, `performanceId`, timestamps, plus `performance` → `show` and `venue`, and `tickets` → `ticketType`. It does **not** include `staffNotes`, `legacyRef` or `userId`; the staff shape is `GET /api/reservations/:id`.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Booking ID is required` |
| 404 | `Booking not found` |
| 403 | `You do not have access to this booking` |

---

#### `PUT /api/bookings/:id/tickets`

**Source** `server/api/bookings/[id]/tickets.put.ts` · **Auth** owner, or a valid signed access token: same check as `GET /api/bookings/:id`

Customer self-service edit of their own ticket composition. The same desired-quantity diff as the staff route (`PUT /api/reservations/:id/tickets`), with self-service guards on top.

**Body**

| Name | Type | Notes |
| --- | --- | --- |
| `tickets` | array, required, min 1 | `{ ticketTypeId, quantity }`, where `quantity` is the desired **total** for that type, 0–10 |

A ticket type may appear only once. The handler reads each type's current count from a map it does not update, so two entries for one type would compound rather than replace.

**Guards** the booking must be `PENDING` ([ADR-0011](decisions/0011-collection-is-the-payment-boundary.md)); the performance must be `ON_SALE`, in the future, and inside its booking window (`bookingClosesHoursBefore`); only active ticket types may be added; capacity is enforced; and the booking cannot be emptied: cancel it instead.

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

**Response** `200`: `{ "status": "CANCELLED" }`

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Not `PENDING`, or the performance has already started |
| 403 | Not the owner and no valid token |
| 404 | `Booking not found` |

---

#### `GET /api/bookings/available-ticket-types`

**Source** `server/api/bookings/available-ticket-types.get.ts` · **Auth** `authorize(event, createReservation)`: **staff only** (ADMIN, MANAGER, BOX_OFFICE), despite living under `/bookings`

Used by the walk-in / door-sales modal, which needs override-aware prices before any reservation exists.

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `performanceId` | string, required | Read with plain `getQuery` and hand-checked |

**Response** `200`: every base ticket type, sorted by name:

```jsonc
[ { "id": "…", "name": "Adult", "description": null, "effectivePrice": 800, "active": true } ]
```

`active` and `effectivePrice` are resolved through performance → show → base. Inactive types are **returned, not filtered**: the caller decides what to do with them.

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

**Source** `server/api/reservations/index.get.ts` · **Auth** `authorize(event, listReservations)`: staff

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

**Response** `200`: an array in `reservationSummaryWith` shape: reservation columns plus `user` (id, name, email, verified) and `performance` → `show` (id, title, slug) and `venue` (id, name). **No `tickets` array**, this is the list view. Ordered by `createdAt` descending.

With `withCounts=true`, each row gains `ticketCount`: the number of non-refunded tickets. The parameter is a **string enum**, not a boolean, only `'true'` and `'false'` validate, anything else is a 400, and only the exact string `'true'` triggers the count.

**SQLite parameter limit.** The count query batches reservation IDs into **chunks of 800** (`const chunkSize = 800`) and issues one grouped `COUNT` per chunk, because a single `IN (…)` with thousands of bound parameters would exceed SQLite/D1's limit. If you add a similar bulk lookup elsewhere, copy this pattern.

**Errors** `403` when not staff; `400` on an invalid `status` or `withCounts` value.

---

#### `POST /api/reservations`

**Source** `server/api/reservations/index.post.ts` · **Auth** `authorize(event, createReservation)`: staff

```ts
z.object({
  performanceId: z.string().min(1),

  // Either userId, or both name and email
  userId: z.string().optional(),
  name:   z.string().min(1).optional(),
  email:  z.email().optional(),
  phone:  z.string().optional(),          // accepted and then discarded, there is no phone column

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

**Response** `200`: the created reservation in `reservationSummaryWith` shape (no `tickets` array; fetch the detail endpoint if you need it).

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Refinement failure: `Either userId or both name and email are required` |
| 404 | `Performance not found` |
| 404 | `User not found` (when `userId` was supplied) |
| 400 | `Ticket type <id> not found` |
| 409 | `Not enough tickets available for this performance` |
| 500 | `Failed to create guest account` / `Failed to create reservation` |

**Differences from the public `POST /api/bookings`: read this before reusing either.**

| | `POST /api/bookings` (public) | `POST /api/reservations` (staff) |
| --- | --- | --- |
| Capacity check | Yes, 409 when it would oversell | Yes, 409 when it would oversell |
| Performance status | Must be `ON_SALE` | Any status, including DRAFT and CANCELLED |
| Show status | Must be `PUBLISHED` | Not checked |
| Past performances | Rejected | Allowed |
| Max quantity per line | 10 | 20 |
| Max seats per booking | 10 | No limit |
| Confirmation email | Sent | **Not sent** |
| `staffNotes` | Not accepted | Accepted |

The staff route is deliberately permissive so the box office can sell into an unpublished show, take block bookings and record retrospective sales. It is **not** a way round capacity: `server/api/reservations/index.post.ts` calls the same `assertCapacity`, and staff who need to oversell raise the performance's `capacityOverride` rather than bypassing the check.

**Side effects** Resolves or creates a shadow account exactly as the public route does (match on email, else insert with `password: null`). Inserts one ticket row per seat with `pricePaid` resolved at current rates.

---

#### `GET /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.get.ts` · **Auth** `authorize(event, readReservation, { userId })`: staff can read any; a customer can read one whose `userId` matches their session

The reservation is loaded *before* the authorisation call, since the ability needs the owner's id.

**Response** `200`: `reservationDetailWith` shape: reservation columns (including `staffNotes`), `user`, `performance` → `show` + `venue`, and `tickets` (with `ticketType`) ordered by `createdAt`.

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `403` when neither staff nor owner.

---

#### `PUT /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.put.ts` · **Auth** `authorize(event, updateReservation)`: staff

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

**Response** `200`: the updated `reservations` row (no relations).

**Errors**

| Code | Cause |
| --- | --- |
| 400 | Refinement failure when cancelling without `cancelledBy` |
| 400 | `Reservation ID is required` |
| 400 | `No valid fields provided for update` (empty body) |
| 404 | `Reservation not found` |
| 409 | Moving a paid booking back to `PENDING` or `NO_SHOW`: refund it instead |
| 409 | Cancelling a paid booking with tickets still unrefunded ([ADR-0039](decisions/0039-refund-before-cancelling-a-collected-booking.md)) |
| 403 | Not staff |

**Cancelling a collected booking needs the refund first.** Cancelling releases the seats to resale and the door then reads the booking as `CANCELLED`, so the money has to be back with the customer before it happens: `COLLECTED`/`DOOR` → `CANCELLED` is refused with a 409 naming the amount while any paid, unrefunded ticket remains. Once everything is refunded the transition is allowed, so refund-then-cancel completes normally, and a comped booking (nothing taken) cancels straight away. The reverse direction is open in the same conditions: `POST /:id/refund` accepts a `CANCELLED` booking that still carries money taken, so an already-stranded booking can be put right in the app instead of by hand in D1.

**Side effects** When `status` transitions **to** `CANCELLED` from something else, a cancellation email is sent to the customer. As with the booking confirmation, it is fire-and-forget with `.catch()` logging and `event.context.cloudflare?.context.waitUntil()`. Re-cancelling an already-cancelled reservation sends nothing. Cancelling does **not** delete or refund the ticket rows: they stay, and simply stop counting towards capacity and revenue because those queries filter on status.

---

#### `DELETE /api/reservations/:id`

**Source** `server/api/reservations/[id]/index.delete.ts` · **Auth** `authorize(event, deleteReservation)`: **ADMIN or MANAGER only** (BOX_OFFICE cannot)

**Response** `200`: `{ message: 'Reservation deleted successfully' }`

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `403` for BOX_OFFICE and customers.

**Side effects** Hard delete. Deletes all `tickets` rows for the reservation first (required, because `tickets.reservationId` is `onDelete: 'restrict'`) then the reservation. There is no soft-delete, no audit row, and no email. Revenue history for that booking disappears from `/api/admin/stats` and the CSV export. Prefer `PUT … { status: 'CANCELLED' }` in almost every real situation.

---

#### `PUT /api/reservations/:id/tickets`

**Source** `server/api/reservations/[id]/tickets.put.ts` · **Auth** `authorize(event, updateReservation)`: staff

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
- `quantity < current` → delete the difference, **newest rows first (LIFO)**: rows are sorted oldest-first by `createdAt` and the tail is removed.
- `quantity === current` → no-op.
- Ticket types **omitted from the body are left untouched**. To empty a reservation you must list every type explicitly with `quantity: 0`.
- Rows with `refundedAt` set are excluded from the current-state query and are never inserted, deleted, or counted.

**Price re-resolution: the thing to watch.** Newly inserted rows get `pricePaid` from `resolveEffectivePrice` **at the current override chain**, not from the prices in the rest of the reservation. If the show price changed after the original booking, adding a seat to an old reservation records the *new* price, and the reservation ends up with mixed `pricePaid` values for the same ticket type. Existing rows are never repriced. Deletion is a hard `DELETE`, so shrinking a reservation destroys the original price snapshot.

**Response** `200`: the full reservation in `reservationDetailWith` shape, so the caller can re-render immediately.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Reservation ID is required` |
| 404 | `Reservation not found` |
| 500 | `Performance not found`: a 500, not a 404, because it indicates a broken foreign key |
| 400 | `Ticket type <id> not found` |
| 403 | Not staff |

**Side effects** No capacity check whatsoever, and no email. Inserts and deletes run as separate statements outside a transaction.

---

#### `GET /api/reservations/:id/available-ticket-types`

**Source** `server/api/reservations/[id]/available-ticket-types.get.ts` · **Auth** `authorize(event, updateReservation)`: staff (note: the *update* ability, not a read ability)

**Response** `200`: identical shape to `/api/bookings/available-ticket-types`: every base type with `{ id, name, description, effectivePrice, active }`, sorted by name, resolved through performance → show → base for this reservation's performance. Inactive types are included.

**Errors** `400 Reservation ID is required`; `404 Reservation not found`; `500 Performance not found`; `403` when not staff.

---

### 3.4 Shows

---

#### `GET /api/performances`

**Source** `server/api/performances/index.get.ts` · **Auth** `authorize(event, listShows)`: any logged-in user

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
never bound: two parameters whether the page holds five performances or two hundred.

---

#### `GET /api/shows`

**Source** `server/api/shows/index.get.ts` · **Auth** `authorize(event, listShows)`: any logged-in user

> This endpoint returns every show, including `DRAFT` ones. Each show carries its full `performances`
> array, and each performance includes the internal `notes` column: production notes that are
> explicitly "not shown to customers" per the schema: along with `capacityOverride`, `ticketsSold`,
> and DRAFT/CANCELLED statuses. `listShows` resolves to "any logged-in user, regardless of role"
> (see §2), so a customer account is enough to enumerate the unannounced season. The customer-safe
> alternative is `/api/whats-on`.

**Query**: the response is always the standard `{ rows, total, page, limit }` envelope.

| | | |
|---|---|---|
| `scope` | `all` \| `active` \| `current` \| `upcoming` \| `archive` \| `draft` | default `all` |
| `status` | `DRAFT` \| `PUBLISHED` | |
| `q` | ≤100 chars | matches title, subtitle, slug **and venue name** |
| `from`, `to` | `YYYY-MM-DD` | shows with a performance inside the window, inclusive, Europe/London |
| `view` | `tree` \| `options` | `tree` nests performances; `options` returns `{ id, slug, title, status }` |
| `sort` | `run` \| `title` | default `run`: earliest performance |
| `order` | `asc` \| `desc` | defaults to `desc` for `scope=archive`, `asc` otherwise |
| `page` | | default 1 |
| `limit` | | default 25, **max 50** for `view=tree`, 500 for `view=options` |

`draft`, `current`, `upcoming` and `archive` **partition** every show: each show is in exactly one,
so per-tab counts add up to the whole. `active` is `current ∪ upcoming`. A published show with no
performances counts as `archive`, which is the only scope with an `IS NULL` arm and the reason the
partition holds. "Today" is resolved in `Europe/London`, not the Worker's UTC.

A `tree` page is capped at 50 rows because the page's show ids are the one thing bound as a list, and
50 of those plus a fully-loaded filter stays comfortably under D1's 100-parameter limit. Every filter
is a correlated subquery and binds nothing that grows with the archive; per-performance lookups scope
through a subquery rather than binding ~150 performance ids. Do not raise the cap without recounting.

A `tree` row adds `performanceCount`, `firstPerformanceAt` and `lastPerformanceAt` to the fields below.

**Response** `200`: `rows`, each with:

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

**Source** `server/api/shows/index.post.ts` · **Auth** `authorize(event, createShow)`: ADMIN or MANAGER

```ts
{
  title: z.string().min(1),                                   // 'Title is required'
  slug:  z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), // lowercase, digits, single hyphens
  subtitle:    z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT','PUBLISHED']).optional().default('DRAFT'),
}
```

**Response** `200`: the created `shows` row.

**Errors** `400 A show with this slug already exists`; `400` on a slug that fails the regex; `403` for BOX_OFFICE and customers; `500 Failed to create show`.

---

#### `GET /api/shows/:id`

**Source** `server/api/shows/[id]/index.get.ts` · **Auth** `authorize(event, readShow)`: any logged-in user

> Same exposure as `GET /api/shows`: DRAFT shows returned, `performances[].notes` included, and
> `readShow` means "any logged-in user, regardless of role".

**Response** `200`: one show with **every column**, `performances` ordered by `startsAt` (each with
`venue`, `ticketsSold` and `ticketTypeOverrideCount`), `contentWarnings` with their vocabulary
entries resolved, plus `ticketTypeOverrideCount`, `performanceCount`, `firstPerformanceAt` and
`lastPerformanceAt`.

> **Anything that edits a show must read it from here.** `GET /api/shows` returns a column
> *projection* that omits `longDescription`, `programmeUrl`, `externalUrl`, `contentWarningNotes` and
> `warningsConfirmedNone`. A form populated from a list row cannot see those five, and writing back
> what it never read is what silently emptied shows' write-ups: see
> [09-known-issues](./09-known-issues.md#editing-a-show-wiped-its-write-up).

Every count scopes through a subquery on this show's performances rather than binding their ids, so
the parameter cost is fixed however long the run.

**Errors** `400 Show ID is required`; `404 Show not found`.

---

#### `PUT /api/shows/:id`

**Source** `server/api/shows/[id]/index.put.ts` · **Auth** `authorize(event, updateShow)`: ADMIN or MANAGER

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
bound parameters at 100 and each link binds three). Repeated ids are deduped before the write:
the unique index is `(show_id, content_warning_id)`, so a duplicate would otherwise fail mid-batch.

`level` must be `null` for a technical warning and set for a general one. That spans two tables, so
SQLite cannot express it as a CHECK; the handler looks the submitted ids up and rejects a mismatch
with `400 "<title>" is a technical effect and cannot have a level` or
`400 "<title>" needs a level: mentioned, discussed or depicted`. An id not in the vocabulary is
`400 Unknown content warning: <id>`.

**Response** `200`: the updated `shows` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `400 A show with this slug already exists` (checked only when the slug actually changes); `403`.

**Side effects** Setting `posterUrl` here rewrites the column **without** touching R2: the old blob is orphaned and the new pathname is not validated. Use `POST /api/shows/:id/poster` instead. Setting `status: 'DRAFT'` is the only way to unpublish a show; the publish endpoint cannot.

---

#### `DELETE /api/shows/:id`

**Source** `server/api/shows/[id]/index.delete.ts` · **Auth** `authorize(event, deleteShow)`: **ADMIN only**

**Response** `200`: `{ message: 'Show deleted successfully' }`

**Errors** `400 Show ID is required`; `404 Show not found`; `403` for MANAGER, BOX_OFFICE, and customers.

**Side effects** A cascading delete with no confirmation step and no dry run:

- `performances` cascade (`onDelete: 'cascade'`).
- `show_ticket_type_overrides` cascade.
- `performance_ticket_type_overrides` cascade along with their performances.
- `tickets.performanceId` is `onDelete: 'restrict'`, so **if any performance has ever had a ticket issued, the database rejects the delete** and the error surfaces uncaught as a 500 rather than a tidy 409. Cancel and clear the bookings first.
- The poster blob in R2 is **not** deleted and becomes orphaned.

---

#### `POST /api/shows/:id/poster`

**Source** `server/api/shows/[id]/poster.post.ts`, via `validateAndUploadImage` in `server/utils/images.ts` · **Auth** `authorize(event, updateShow)`: ADMIN or MANAGER

**Body** `multipart/form-data` with a single file field named **`poster`**.

| Constraint | Value |
| --- | --- |
| Allowed MIME types | `image/jpeg`, `image/jpg`, `image/png`, `image/webp` |
| Maximum size | 5 MB (`5 * 1024 * 1024`) |
| Stored at | `shows/<showId>/image-<Date.now()>.<ext>` |
| Access | `public` |

**Response** `200`: the updated `shows` row, with `posterUrl` set to the new blob pathname. Render it through `/images/<pathname>`.

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

**Source** `server/api/shows/[id]/poster.delete.ts` · **Auth** `authorize(event, updateShow)`: ADMIN or MANAGER

**Response** `200`: the updated `shows` row with `posterUrl: null`.

**Errors** `400 Show ID is required`; `404 Show not found`; `404 This show has no poster`; `403`.

**Side effects** Deletes the object from R2 **before** clearing the column, and unlike the upload path this deletion is not wrapped in a try/catch: an R2 failure surfaces as a 500 and the column keeps pointing at the (possibly deleted) blob.

---

#### `POST /api/shows/:id/publish`

**Source** `server/api/shows/[id]/publish.post.ts` · **Auth** `authorize(event, updateShow)`, plus a second `authorize(event, updatePerformance)` when `markPerformancesOnSale` is true: ADMIN or MANAGER for both

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

**Source** `server/api/shows/[id]/performances/index.post.ts` · **Auth** `authorize(event, createPerformance)`: ADMIN or MANAGER

```ts
{
  venueId:  z.string().min(1),                                    // 'Venue is required'
  startsAt: z.number().int(),                                     // UNIX SECONDS, multiplied by 1000
  doorsAt:  z.number().int().optional().nullable(),               // unix seconds
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount:   z.number().int().nonnegative().optional().default(0),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT','ON_SALE','CANCELLED']).optional().default('DRAFT'),
  notes:  z.string().optional().nullable(),                       // internal, but see the GET /api/shows warning
}
```

`startsAt` and `doorsAt` are **seconds**, not milliseconds: the handler does `new Date(body.startsAt * 1000)`. Passing milliseconds silently schedules the performance tens of thousands of years from now. `doorsAt` is falsy-checked, so `0` becomes `null`.

**Response** `200`: the created `performances` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `403`; `500 Failed to create performance`. `venueId` is **not** verified to exist: an unknown venue produces a foreign-key error surfacing as a 500.

---

#### `PUT /api/shows/:id/performances/:performanceId`

**Source** `server/api/shows/[id]/performances/[performanceId]/index.put.ts` · **Auth** `authorize(event, updatePerformance)`: ADMIN or MANAGER

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

**Response** `200`: the updated `performances` row.

**Errors** `400 Show ID and Performance ID are required`; `400 No such venue`; `404 Performance not found`; `409` when the update would drop capacity below what is already sold; `403`.

**Capacity is guarded as one figure.** Effective capacity is `capacityOverride ?? venue.capacity` ([ADR-0007](decisions/0007-one-seat-counting-rule.md)), so the handler resolves what the update would leave in place, on both fields at once, and refuses with a 409 when that lands below `countOccupiedSeatsFor()`. All three routes into the same dead end are covered: lowering the override, clearing it, and moving the performance to a smaller venue. Only a *reduction* is checked, so raising the capacity can still repair a performance that is already past its house. Null stays uncapped, matching `assertCapacity`. Raising the override above the venue's capacity remains the sanctioned way to oversell deliberately.

**Side effects** Setting `status: 'CANCELLED'` sends no emails to affected customers; that has to be done by hand.

---

#### `DELETE /api/shows/:id/performances/:performanceId`

**Source** `server/api/shows/[id]/performances/[performanceId]/index.delete.ts` · **Auth** `authorize(event, deletePerformance)`: ADMIN or MANAGER

**Response** `200`: `{ message: 'Performance deleted successfully' }`

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `Show ID and Performance ID are required` |
| 404 | `Performance not found` (also when the performance belongs to a different show) |
| 409 | `Cannot delete this performance because it has tickets associated with it`: the delete is wrapped in a try/catch that converts the FK violation |
| 403 | Not ADMIN/MANAGER |

**Side effects** `performance_ticket_type_overrides` cascade. Reservations pointing at the performance block the delete via `reservations.performanceId` restrict, which is also caught and reported as the same 409.

---

### 3.5a Content warnings

The shared vocabulary every show picks from. A warning is either a **technical effect**: strobe,
haze, loud noise, no level, or a **general** theme recorded on each show as `MENTIONED`,
`DISCUSSED` or `DEPICTED`. See [ADR-0004](./decisions/0004-content-warning-model.md).

#### `GET /api/content-warnings`

**Source** `server/api/content-warnings/index.get.ts` · **Auth** `authorize(event, listContentWarnings)`: staff

**Query** `includeArchived` (`'true'`/`'false'`, default `'false'`) · `kind` (`TECHNICAL`/`GENERAL`)

**Response** `200`: an array of `{ id, slug, title, kind, category, description, icon, sort, archived, showCount }`,
ordered technical-first then by `(sort, title)`. `showCount` is a correlated subquery counting the
shows that carry the entry; it is what the admin page uses to warn before a rename and what blocks a
delete.

> The show editor and the admin page must not share a `useFetch` key. The editor caches the live
> vocabulary under `content-warnings` and reads it back through `getCachedData`; the admin page asks
> for archived entries and keys itself `admin-content-warnings` so the editor never offers them.

#### `POST /api/content-warnings`

**Source** `server/api/content-warnings/index.post.ts` · **Auth** `authorize(event, createContentWarning)`: ADMIN or MANAGER

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

**Response** `200`: the created row.

**Errors** `400 A content warning with the slug "…" already exists`; `400 A content warning with this title already exists`; `400 Title must contain at least one letter or number`; `403`.

#### `PUT /api/content-warnings/:id`

**Source** `server/api/content-warnings/[id]/index.put.ts` · **Auth** `authorize(event, updateContentWarning)`: ADMIN or MANAGER

Same body as `POST`, every key optional, plus `archived: z.boolean().optional()`. Only present keys
are written; an empty body returns the existing row.

**Errors** `404 Content warning not found`; the two uniqueness `400`s above; `403`; and
`409 Cannot change the type of this warning while N show(s) use it`: `kind` decides whether a link
carries a level, and the existing links were written under the old answer, so there is no correct
level to invent on their behalf.

#### `DELETE /api/content-warnings/:id`

**Source** `server/api/content-warnings/[id]/index.delete.ts` · **Auth** `authorize(event, deleteContentWarning)`: **ADMIN only**

**Response** `200`: `{ message: 'Content warning deleted successfully' }`

**Errors** `404 Content warning not found`; `403`;
`409 Cannot delete "<title>" because N show(s) use it. Archive it instead…`.

> The foreign key is `onDelete: 'restrict'`, deliberately. Under a cascade, deleting an entry would
> have stripped it from every show carrying it with nothing to show a customer or an auditor that it
> was ever there. Archiving is the retirement path: the entry stops being offered on new shows and
> keeps rendering on the ones that have it.

#### `GET /api/shows/:id/legacy-content-warnings`

**Source** `server/api/shows/[id]/legacy-content-warnings.get.ts` · **Auth** `authorize(event, readShow)`: staff

**Response** `200`: `[{ title, kind }]`: the warnings this show carried before the rework that
migration 0016 could not map onto the new vocabulary, ordered by title. Empty for most shows; 30 have
entries. The show editor renders them under "Not carried over from the old system".

Read from `show_content_warnings_archive.mapped_to_warning_id IS NULL`: the migration's own record:
rather than derived by looking for archive ids missing from the live table. The remap collapses rows
(`Sexism` and `Misogyny` both became `sexism`), so only one of the two ids survives and the other
would look dropped.

---

### 3.6 Ticket types and price overrides

#### `GET /api/ticket-types`

**Source** `server/api/ticket-types/index.get.ts` · **Auth** **Public**: no `authorize()`; the comment in the source explains that booking flows need it

**Query** `?includeArchived=true` to include retired types. Omitted or `false` returns only live
ones, so a caller that just wants "the ticket types" cannot accidentally offer a dead Fringe type.
The management screen at `/admin/ticket-types` is the one caller that passes it, because it is where
types are archived and restored.

**Response** `200`: `ticket_types` rows ordered by name:
`{ id, name, description, price, kind, archived, activeByDefault, createdAt, updatedAt }`.
`price` is in pence.

`archived` and `activeByDefault` answer different questions: see
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md#archived-vs-activebydefault--two-different-questions).

---

#### `POST /api/ticket-types`

**Source** `server/api/ticket-types/index.post.ts` · **Auth** `authorize(event, createTicketType)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),                    // 'Name is required'
  description: z.string().optional(),
  price:       z.number().int().nonnegative(),       // pence; 0 is valid (free tickets)
  activeByDefault: z.boolean().optional().default(true),
}
```

**Response** `200`: the created row. **Errors** `400 A ticket type with this name already exists`; `403`; `500 Failed to create ticket type`.

---

#### `GET /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.get.ts` · **Auth** **Public**

**Response** `200`: one `ticket_types` row. **Errors** `400 Ticket type ID is required`; `404 Ticket type not found`.

---

#### `PUT /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.put.ts` · **Auth** `authorize(event, updateTicketType)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price:       z.number().int().nonnegative().optional(),
  activeByDefault: z.boolean().optional(),
}
```

An empty body returns the existing row with `200`.

**Response** `200`: the updated row. **Errors** `400 Ticket type ID is required`; `404 Ticket type not found`; `400 A ticket type with this name already exists`; `403`.

**Side effects** Changing `price` affects **future** price resolution only. Already-issued tickets keep their `pricePaid` snapshot, but any row added later through `PUT /api/reservations/:id/tickets` picks up the new price, which is how a single reservation ends up with two prices for one ticket type.

---

#### `DELETE /api/ticket-types/:id`

**Source** `server/api/ticket-types/[id]/index.delete.ts` · **Auth** `authorize(event, deleteTicketType)`: **ADMIN only**

**Response** `200`: `{ message: 'Ticket type deleted successfully' }`

**Errors** `400 Ticket type ID is required`; `404 Ticket type not found`; `409 Cannot delete this ticket type because it has issued tickets associated with it`; `403`.

**Side effects** `show_ticket_type_overrides` and `performance_ticket_type_overrides` referencing the type cascade away. Issued `tickets` restrict the delete, caught and reported as the 409 above.

---

#### `GET /api/shows/:id/ticket-types`

**Source** `server/api/shows/[id]/ticket-types/index.get.ts` · **Auth** `authorize(event, readShow)`

> `readShow` is `defineAbility(() => true)`, but because it is used through `authorize()` with `allowGuest: false`, **a session is still required**. Effective access: any logged-in user, no role needed. Guests get a 403.

**Response** `200`: every base ticket type, ordered by name, annotated with this show's override:

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

**Source** `server/api/shows/[id]/ticket-types/index.put.ts` · **Auth** `authorize(event, updateShow)`: ADMIN or MANAGER

```ts
{
  ticketTypeId: z.string().min(1),                         // 'Ticket type ID is required'
  price:  z.number().int().nonnegative().optional().nullable(),   // pence; null = inherit base price
  active: z.boolean().optional().nullable(),                      // null = inherit activeByDefault
}
```

An **upsert** keyed on (`showId`, `ticketTypeId`), matching the unique index. One ticket type per request.

Note that omitting a field is the same as sending `null`: the handler writes `body.price ?? null` and `body.active ?? null` in both the insert and the update branch. Updating an existing override to change only `active` therefore **wipes its `price` back to inherit**. Always send both fields.

**Response** `200`: the created or updated `show_ticket_type_overrides` row.

**Errors** `400 Show ID is required`; `404 Show not found`; `404 Ticket type not found`; `403`.

---

#### `DELETE /api/shows/:id/ticket-types/:ticketTypeId`

**Source** `server/api/shows/[id]/ticket-types/[ticketTypeId]/index.delete.ts` · **Auth** `authorize(event, updateShow)`: ADMIN or MANAGER

**Response** `200`: `{ message: 'Show ticket type override removed' }`

**Errors** `400 Show ID and Ticket Type ID are required`; `404 Show not found`; `404 No override exists for this ticket type`; `403`.

**Side effects** The type reverts to base defaults for this show. Performance-level overrides on the same show are untouched and continue to win. Already-issued tickets keep their prices.

---

#### `GET /api/shows/:id/performances/:performanceId/ticket-types`

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/index.get.ts` · **Auth** `authorize(event, readShow)`: any logged-in user (see the note above; guests get 403)

**Response** `200`: every base ticket type ordered by name, with both override levels exposed separately:

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

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/index.put.ts` · **Auth** `authorize(event, updatePerformance)`: ADMIN or MANAGER

Same body schema as the show-level upsert:

```ts
{
  ticketTypeId: z.string().min(1),
  price:  z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional().nullable(),
}
```

Upsert keyed on (`performanceId`, `ticketTypeId`). The same "omitted means null" caveat applies: send both `price` and `active` on every call.

**Response** `200`: the created or updated `performance_ticket_type_overrides` row.

**Errors** `400 Show ID and Performance ID are required`; `404 Show not found`; `404 Performance not found`; `404 Ticket type not found`; `403`.

---

#### `DELETE /api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId`

**Source** `server/api/shows/[id]/performances/[performanceId]/ticket-types/[ticketTypeId]/index.delete.ts` · **Auth** `authorize(event, updatePerformance)`: ADMIN or MANAGER

**Response** `200`: `{ message: 'Performance ticket type override removed' }`

**Errors** `400 Show ID, Performance ID and Ticket Type ID are required`; `404 Show not found`; `404 Performance not found`; `403`.

Unlike its show-level counterpart, this handler does **not** check that the override exists: deleting a non-existent override succeeds with the same 200 message.

---

### 3.7 Users

These act on the **local mirror** only: `id`, `email`, `name`, `anonymisedAt`, timestamps. Credentials, roles, verification and erasure belong to the auth service; there is deliberately no `PUT /api/users/:id`, no password reset and no role editor here, and the abilities that used to describe them have been removed rather than left implying a permission model this app does not enforce.

```jsonc
{
  "id": "…", "email": "…", "name": "…",
  "anonymisedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

Anonymised rows and legacy `.invalid` placeholders never appear in listings or lookups: they surface only as a `hiddenAnonymised` count on the paginated response.

---

#### `GET /api/users`

**Source** `server/api/users/index.get.ts` · **Auth** `authorize(event, listUsers)`: staff (ADMIN, MANAGER, BOX_OFFICE)

**Query** `?email=` returns **at most one row, as a bare array**: the exact-address lookup the box-office walk-in form uses, so a volunteer's browser never receives the user table. Otherwise `?page`, `?limit` (max 100) and `?q` (name or email, case-insensitive) give the paginated envelope `{ rows, total, page, limit, hiddenAnonymised }`.

Note the two response shapes from one path; `?email=` is the exception to the `Paginated<T>` contract in `server/utils/pagination.ts`.

**Errors** `403`.

---

#### `POST /api/users`

**Source** `server/api/users/index.post.ts` · **Auth** `authorize(event, createUser)`: ADMIN or MANAGER, plus granular `allows()` checks

```ts
{
  email: z.email(),
  name:  z.string().min(1),                                        // 'Name is required'
  verified: z.boolean().optional().default(false),                 // ADMIN only when true
  roles: z.array(z.enum(['ADMIN','MANAGER','BOX_OFFICE'])).optional().default([]),  // ADMIN only when non-empty
}
```

A MANAGER may create a plain user, but `allows(event, updateUserVerified)` and `allows(event, updateUserRoles)` are ADMIN-only, so a MANAGER sending `verified: true` or any `roles` gets a 403.

**Response** `200`: the formatted user with roles.

**Errors**

| Code | Cause |
| --- | --- |
| 400 | `User with this email already exists` |
| 502 | The auth service is unreachable, or `NUXT_AUTH_SERVICE_TOKEN` is unset |
| 403 | Not ADMIN/MANAGER |

**Side effects** Calls `POST /api/users/shadow` on the auth service to match or create the central
identity, then mirrors the returned id locally. No password is set and no email is sent: the person
claims the account by registering or signing in with Google on the same address, and their booking
history comes with it. If the auth service is unreachable the operation fails rather than creating a
local-only user, because an id this app invented would never match the central one.

---

#### `GET /api/users/:id`

**Source** `server/api/users/[id]/index.get.ts` · **Auth** `authorize(event, readUser, user)`: staff can read anyone; any user can read themselves

The row is fetched before the check, so an unknown id yields 404 regardless of who is asking.

**Response** `200`: the formatted user. **Errors** `400 User ID is required`; `404 User not found`; `403`.

---

#### `GET /api/users/:id/summary`

**Source** `server/api/users/[id]/summary.get.ts` · **Auth** `authorize(event, readUser, { id })`: staff can read anyone; any user can read themselves

The mirror row is loaded and 404s first, so the check runs on an id that exists and an unknown id
answers the same to everyone. The resource argument is not optional: an ability called without it
throws, and a throw inside `authorize()` **grants** ([ADR-0038](decisions/0038-no-ability-may-throw.md)).

**Response** `200`: the person, their last 50 reservations with show titles and amounts, their passes,
their shift history and their counts. The access profile is included only for a caller who holds
`canVerifyAccess`, which is checked directly rather than through `authorize`.

**Errors** `400 User ID is required`; `401` when nobody is signed in; `404 No mirror row for that account`; `403`.

---

#### `DELETE /api/users/:id`

**Source** `server/api/users/[id]/index.delete.ts` · **Auth** `authorize(event, deleteUser, { id: userId })`

The `deleteUser` ability is unusual: read it carefully:

| Caller | Target | Allowed? |
| --- | --- | --- |
| Non-ADMIN | themselves | ✅ yes (self-service account deletion) |
| ADMIN | someone else | ✅ yes |
| ADMIN | themselves | ❌ **no**: admins cannot delete their own account |
| MANAGER / BOX_OFFICE | someone else | ❌ no |

**Response** `200`: `{ message: 'User deleted successfully' }`

**Errors** `400 User ID is required`; `404 User not found`; `409` when anything still references the row; `403`.

**The guard is reference-agnostic.** Thirty-odd columns across the schema point at `users.id`. The `restrict` ones would surface a raw foreign-key error as a 500, and the `set null` ones are worse: the delete would succeed and quietly blank who voided a transaction, who approved a comp and who signed a night off, while `access_profiles` and `training_runs` cascade away entirely. So `tablesReferencingUser()` (`server/utils/userReferences.ts`) reads the referencing columns out of the Drizzle schema and asks, in one statement with one bound parameter, whether any of them holds a row. Any hit is a 409 naming the tables. A new `references(() => users.id)` is covered the moment it is declared, with nothing to remember to update.

**Side effects** none: this deletes the mirror row only, and the central identity is untouched. In practice anyone who has ever booked, held a pass, worked a shift or taken money is undeletable, which is the intent: to remove a *person*, use erasure at the auth service, which calls this app's anonymise hook ([ADR-0014](decisions/0014-anonymise-never-delete.md)). The caller's session is not cleared when they delete themselves.

---

### 3.7a Passes and pass types

Season and festival passes. Design notes in [10-passes-design](./10-passes-design.md); the
entitlement rule lives in `server/utils/passes.ts` and nowhere else.

#### `GET /api/pass-types`

**Source** `server/api/pass-types/index.get.ts` · **Auth** `authorize(event, listPassTypes)`: staff

Pass products with their price variants, show scope count and issued count.

#### `POST /api/pass-types`

**Source** `server/api/pass-types/index.post.ts` · **Auth** `authorize(event, managePassTypes)`: ADMIN or MANAGER

Creates a product, its price variants and its show scope in one batch. **Always created `DRAFT`**:
use the route below to put it on sale.

`validFrom` / `validTo` accept `YYYY-MM-DD` and are stored as the **first and last instants of those
days in Europe/London**, so a pass covers the whole of its final day. Passing a full ISO datetime
overrides that.

#### `PUT /api/pass-types/:id`

**Source** `server/api/pass-types/[id]/index.put.ts` · **Auth** `authorize(event, managePassTypes)`: ADMIN or MANAGER

Edits a product and is the **only** way to change `status`. The box office offers `ON_SALE` types
only, so without this a pass product could never be sold.

**Errors** `409` when putting a product on sale that covers no shows (it would be redeemable
nowhere), and `409` when lowering `maxIssued` below the number already issued.

#### `GET /api/passes`

**Source** `server/api/passes/index.get.ts` · **Auth** `authorize(event, listPasses)`: staff

Paginated `{ rows, total, page, limit }`. `?q` matches reference, holder name or holder email.

With `?performanceId=`, each row gains `redeemable: { ok, reason?, message? }`, the door check,
decided for the whole page in four queries rather than five per pass.

#### `POST /api/passes`

**Source** `server/api/passes/index.post.ts` · **Auth** `authorize(event, issuePass)`: staff

Issues a pass to a holder, creating a shadow account via the auth service when the buyer has none.

The sale guards live in `assertPassSellable()` (`server/utils/passes.ts`) and are shared with
fulfilment, so there is one definition rather than two: the pass type is `ON_SALE`, `now` is inside
`salesOpenAt`/`salesCloseAt`, the price row belongs to the type and is `active`, and the count of
ACTIVE passes is below `maxIssued`. `409 This pass has sold out` when it is not.

#### `PUT /api/passes/:id`

**Source** `server/api/passes/[id]/index.put.ts` · **Auth** `authorize(event, cancelPass)`: ADMIN or MANAGER

Cancels or reinstates one issued pass.

#### `POST /api/passes/:id/redeem`

**Source** `server/api/passes/[id]/redeem.post.ts` · **Auth** `authorize(event, redeemPass)`: staff

Admits a pass holder to a performance: writes a £0 `PASS_ADMISSION` ticket and a `pass_admissions`
ledger row in one batch. `canRedeem` checks, in order, that the pass is ACTIVE, in date, covers the
show, has not already been used for this performance, that the performance is ON_SALE, and that
there is room.

`UNIQUE (pass_id, performance_id)` on `pass_admissions` **is** the once-per-performance rule: D1 has
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

**Source** `server/api/venues/index.get.ts` · **Auth** **Public**: no `authorize()`

**Response** `200`: all venues with features, ordered by name.

---

#### `POST /api/venues`

**Source** `server/api/venues/index.post.ts` · **Auth** `authorize(event, createVenue)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),                       // 'Name is required'
  address:     z.string().optional(),
  capacity:    z.number().int().positive().optional(),  // null/absent = unlimited for capacity checks
  description: z.string().optional(),
  featureIds:  z.array(z.string()).optional().default([]),
}
```

**Response** `200`: the created venue with features.

**Errors** `400 Venue with this name already exists`; `403`; `500 Failed to create venue` / `Failed to retrieve created venue`.

**Side effects** Inserts `venues_to_features` join rows for each `featureIds` entry. IDs are **not** validated, so an unknown feature id raises a foreign-key error as a 500 *after* the venue has been created. There is no image field here: upload separately.

---

#### `GET /api/venues/:id`

**Source** `server/api/venues/[id]/index.get.ts` · **Auth** **Public**

**Response** `200`: one venue with features. **Errors** `400 Venue ID is required`; `404 Venue not found`.

---

#### `PUT /api/venues/:id`

**Source** `server/api/venues/[id]/index.put.ts` · **Auth** `authorize(event, updateVenue)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  address:     z.string().optional().nullable(),
  capacity:    z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  featureIds:  z.array(z.string()).optional(),
}
```

**Response** `200`: the updated venue with features.

**Errors** `400 Venue ID is required`; `404 Venue not found`; `400 Venue name is already taken`; `403`; `500 Failed to retrieve updated venue`.

**Side effects** `featureIds` is a **full replacement**: every existing join row is deleted and the supplied list inserted. Sending `[]` removes all features; omitting the key leaves them alone. `imageUrl` cannot be set here. Lowering `capacity` below tickets already sold is permitted and silently makes affected performances over-capacity.

---

#### `DELETE /api/venues/:id`

**Source** `server/api/venues/[id]/index.delete.ts` · **Auth** `authorize(event, deleteVenue)`: **ADMIN only**

**Response** `200`: `{ message: 'Venue deleted successfully' }`

**Errors** `400 Venue ID is required`; `404 Venue not found`; `403`; `409 This venue cannot be deleted because it has N performances against it…`.

**Side effects** `venues_to_features`, `venue_emergency_info`, `venue_aliases` and shift-template rows cascade. **`performances.venueId` is `onDelete: 'restrict'`**, so the handler counts performances at the venue first and refuses with a 409 naming the count, in the shape `DELETE /api/shows/:id` uses. The R2 image is deleted **after** the row delete succeeds, logging and continuing if that fails, so a refused delete never leaves the venue page pointing at an object that is gone.

---

#### `POST /api/venues/:id/image`

**Source** `server/api/venues/[id]/image.post.ts`, via `validateAndUploadImage` · **Auth** `authorize(event, updateVenue)`: ADMIN or MANAGER

**Body** `multipart/form-data` with a single file field named **`image`** (the show equivalent uses `poster`). Same constraints: JPEG/PNG/WebP, max 5 MB, stored at `venues/<venueId>/image-<Date.now()>.<ext>` with public access.

**Response** `200`: `{ imageUrl: '<pathname>', message: 'Image uploaded successfully' }`. Note this differs from the show poster endpoint, which returns the whole updated row.

**Errors** `400 Venue ID is required`; the three `validateAndUploadImage` 400s (`No file provided`, `No file provided (field name: image)`, `Invalid file type…`, `File size exceeds 5MB limit`); `404 Venue not found`; `403`.

**Side effects** Uploads to R2 and deletes the previous blob, swallowing deletion failures.

---

#### `DELETE /api/venues/:id/image`

**Source** `server/api/venues/[id]/image.delete.ts` · **Auth** `authorize(event, updateVenue)`: ADMIN or MANAGER

**Response** `200`: `{ message: 'Image deleted successfully' }`

**Errors** `400 Venue ID is required`; `404 Venue not found`; `404 Venue has no image to delete`; `500 Failed to delete image from storage`; `403`.

**Side effects** Unlike the venue *delete* handler, an R2 failure here aborts with a 500 and the `imageUrl` column is left pointing at the blob.

---

#### `GET /api/venue-features`

**Source** `server/api/venue-features/index.get.ts` · **Auth** **Public**

**Query** `page`, `limit` (max 100, default 25) and optional `q`, matching `name`.

**Response** `200`: the `Paginated<T>` envelope, rows ordered by name: `{ rows: [{ id, name, description, icon, createdAt, updatedAt }], total, page, limit }`.

---

#### `POST /api/venue-features`

**Source** `server/api/venue-features/index.post.ts` · **Auth** `authorize(event, createVenueFeature)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1),      // 'Name is required'
  description: z.string().optional(),
  icon:        z.string().optional(),  // emoji or icon class name
}
```

**Response** `200`: the created row. **Errors** `400 Feature with this name already exists`; `403`; `500 Failed to create venue feature`.

---

#### `GET /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.get.ts` · **Auth** **Public**

**Response** `200`: one feature row. **Errors** `400 Feature ID is required`; `404 Venue feature not found`.

---

#### `PUT /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.put.ts` · **Auth** `authorize(event, updateVenueFeature)`: ADMIN or MANAGER

```ts
{
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon:        z.string().optional().nullable(),
}
```

An empty body returns the existing row with `200`.

**Response** `200`: the updated row. **Errors** `400 Feature ID is required`; `404 Venue feature not found`; `400 Feature name is already taken`; `403`; `500 Failed to update venue feature`.

---

#### `DELETE /api/venue-features/:id`

**Source** `server/api/venue-features/[id]/index.delete.ts` · **Auth** `authorize(event, deleteVenueFeature)`: **ADMIN only**

**Response** `200`: `{ message: 'Venue feature deleted successfully' }`

**Errors** `400 Feature ID is required`; `404 Venue feature not found`; `403`.

**Side effects** `venues_to_features` rows cascade, so the feature silently disappears from every venue that had it. There is no warning and no usage count.

---

### 3.9 What's On

These two endpoints are the customer-safe view of the programme. Unlike `/api/shows`, they filter to `PUBLISHED` shows and future `ON_SALE` performances.

---

#### `GET /api/whats-on`

**Source** `server/api/whats-on/index.get.ts` · **Auth** **Public**

**Query** none.

**Response** `200`: published shows that have at least one `ON_SALE` performance starting after "now", sorted by earliest performance date. Shows with no qualifying performance are dropped. Returns `[]` when nothing is on.

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

`ticketsSold` comes from `countOccupiedSeats`, the same rule the capacity check uses, so the sold-out badge and the booking path always agree. Show and performance rows are projected through the allow-lists in `server/utils/queries/whatsOn.ts`: the internal `notes` column is **not** returned.

---

#### `GET /api/whats-on/:slug`

**Source** `server/api/whats-on/[slug].get.ts` · **Auth** **Public**

Looked up by `slug` **and** `status = 'PUBLISHED'`, so a DRAFT show is a 404 on this route (it is still fully visible via `GET /api/shows`).

**Response** `200`: the show with every future `ON_SALE` performance, each carrying the **full venue row** (including `address`, `description`, `imageUrl`) plus:

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

Unlike the other `available-ticket-types` endpoints, this one **filters out inactive ticket types** and sorts by `effectivePrice` ascending: it feeds the public booking form directly. `isSoldOut` is always `false` when capacity is unknown.

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

**Source** `server/api/shifts/index.get.ts` · **Auth** `authorize(event, listShifts)`: staff, or any holder of `foh.work`

```ts
{
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // inclusive, Europe/London
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}
```

Bounded by the performance's own `startsAt`, so the bound-parameter count does not grow with the
number of rows covered ([ADR-0006](./decisions/0006-d1-bound-parameter-limit.md)). Cancelled
performances are excluded.

**Response** `200`: a bare array of shifts, each carrying its performance, show title and venue
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

**Response** `200`: a bare array of `{ performanceId, startsAt, showId, showTitle, venueName }`.

---

#### `GET /api/performances/:id/shifts`

**Source** `server/api/performances/[id]/shifts/index.get.ts` · **Auth** `authorize(event, listShifts)`

**Response** `200`: the performance's slots, ordered by role then creation, each with
`userId` and `userName` (null on an open slot).

---

#### `POST /api/performances/:id/shifts`

**Source** `server/api/performances/[id]/shifts/index.post.ts` · **Auth** `authorize(event, manageShifts)`: `shift.manage`

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

**Response** `200`: the created row. `404` if the performance, or the assignee's mirror row, does
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

Any manager edit clears `needsEligibilityReview`: that review is exactly what the flag was asking
for ([ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)).

**Response** `200`: the updated row. `409` on a second confirmed duty manager.

---

#### `GET /api/bar/tonight` and the training gate

**`slots` and `choiceOptions` are what the till has to ask before it can ring something up.** A
product's `slots` name the choice ingredients in its recipe, and `choiceOptions` carries the
products that may fill each category, **sent once for the whole menu** rather than repeated per
product (ADR-0036). The tab menu and the training mirror send the same shape.

`alcoholTrained` comes from `isEligible(user, 'bar')`, which reads rehearsal behind one seam
(ADR-0026). The till shows an amber banner on an age-restricted basket when it is false, and
**still sells**: the gate is soft in v1 (`docs/13` §5, §8).

`trainingNeedsReview` is true on the fail-open path, when rehearsal could not be reached and there
was no cached answer. **No banner is shown in that case.** Warning during an outage would warn
everyone at once, which teaches people to ignore the banner precisely when it stops being reliable.

---

#### The bar tab endpoints

**Source** `server/api/bar/tabs/**`, `server/api/admin/bar/tabs/**` · **Design**
[ADR-0030](./decisions/0030-a-tab-is-a-sale-on-credit.md),
[ADR-0031](./decisions/0031-a-tab-charge-is-the-only-voidable-transaction.md)

A tab is a sale on credit: a `transactions` row with `tender = 'TAB'`, real `BAR_ITEM` lines, real
`SALE` movements and `tab_debtor_user_id`. No money has moved, so it is in no SumUp Z-total until
it is settled.

**Two entry routes, two guards.** `/api/bar/tabs/*` is gated on the `bar.tab` permission and
**deliberately not on `requireBarScope`**: that needs a confirmed `BAR` shift joined to a
performance, which is exactly what a quiet weekday afternoon does not have. The till's routes keep
the bar scope, because they are till work.

- `POST /api/bar/tabs` charges **the caller only**. There is no debtor field: you cannot put
  something on somebody else's tab from your own phone.
- **Age-restricted products are refused server-side**, not merely absent from the menu. Alcohol
  reaches a tab only through the till, where the training gate and Challenge 25 apply.
- `GET /api/bar/tabs/holders` lists everyone holding a role that carries `bar.tab`, read from
  stage-door's `GET /api/role-holders` behind `server/utils/tabHolders.ts` and filtered to people
  this app already mirrors, because the debtor column is a restricted foreign key. Cached ten
  minutes per isolate. It returns `available: false` rather than an error when stage-door cannot
  answer, and the till then shows the email field instead.
- `GET /api/bar/tabs/debtor` is the fallback: an **exact email match** returning at most one row,
  never a name search, so a bar phone cannot browse the user table. `404` when there is no mirror
  row, saying they need to sign in to the site once first.
- Charging a `TAB` at the till **refuses a debtor who is not a holder**, and skips that check when
  stage-door could not say. A bar that cannot sell is a worse outage than a tab opened for the
  wrong person, and every tab is attributed either way.
- `POST /api/bar/transactions` with `tender: 'TAB'` requires `tabDebtorUserId` and **forbids
  `reservationIds`**. Ticket money on credit would mark a booking paid for money nobody took.
- **Settling clears the whole balance as at now**, against `expectedTotalPence`. There is no list
  of chosen charges: an id list is the shape ADR-0006 forbids, and a predicate makes a concurrent
  double-settle a no-op rather than a race. `409` when the figure has moved, naming both amounts.
- **"As at now" is a rowid, not a timestamp.** `taken_at` is stored to whole seconds, so a charge
  posted to `POST /api/bar/tabs` between the read and the write can read as on or before the
  settle's own `asOf` and be stamped settled against a settlement that never covered it. The read
  therefore returns `max(rowid)` over the charges it summed and the `UPDATE` is bounded by it: D1
  serialises writes, so anything committed since carries a higher rowid and stays outstanding. A
  debt left on a tab is recoverable; one written off silently is not.
- Settlement writes one `CARD` transaction with a single `TAB_SETTLEMENT` line and **no product**,
  and **no stock movements**: the stock left the shelf when the tab was charged.
- The void needs all three of `tender = 'TAB'`, `voided_at IS NULL` and `tab_settled_at IS NULL`,
  and the last two are in the SQL predicate as well as the read. Voiding a settled charge would
  take money out of a day the reader really took it in, possibly against a recorded Z-total.
- **Both halves of the void carry that predicate**, not just the stamp. The stock reversal is a
  single `INSERT ... SELECT` over the charge's own `SALE` movements, batched *before* the stamp and
  conditional on the charge still being unvoided and unsettled, so a second void or a settle that
  got there first credits nothing back to the shelf. When the stamp matches no row the response is
  `409 That charge was paid for or taken off while you were looking at it. Reload the tab.`, never
  `{ ok: true }`: the debtor and the bar manager may both void the same charge, and telling the
  debtor it was removed when it was in fact paid for is how a balance goes missing.

---

#### The comp endpoints

**Source** `server/api/bar/comps/**` · **Auth** see below, and note it is **not** `requireBarScope`
throughout

`POST /api/bar/comps` needs a `BAR` shift: asking for a comp is bar work. **Approving is not.**
The duty manager is frequently not rostered on the bar, so `GET`, `approve` and `decline` scope on
front-of-house tonight and then on being an approver. Guarding those with the bar scope locks the
only person who can approve out of the queue.

- A `PENDING` request writes **nothing**: no transaction, no movement, no stock change.
- The requester approving their own request is `403` unless they are themselves tonight's duty
  manager or `BOX_OFFICE`+, in which case it is the sanctioned inline self-approval and is still
  recorded as approved by them.
- Approval after ten minutes is `409`, derived from `requested_at` rather than from the sweep.
- Approving or declining twice is `409` naming the decision already made.
- `reason: 'OTHER'` without a note is `400`.
- A request from another night is `409`, not `404`: it exists, it is simply not tonight's problem.

---

#### The customer pass endpoints

**Source** `server/api/passes/mine/**`, `server/api/bookings/my-options.get.ts`

Everything else under `/api/passes` is staff-gated. These three are the holder's own view, and they
are gated on **identity, not role**, so they must not be blocked by role staleness (ADR-0008).

- **`/api/passes/mine` is column allow-listed.** `notes`, `issuedByUserId` and `passTypePriceId` are
  internal and never reach it. It reports `inDate` separately from `status`, because "cancelled" and
  "does not cover today" are different answers.
- **Redeeming uses `canRedeem`**, the same single rule as the door (`docs/10` §4). There is no
  second copy, and `admitOnPass()` is now the one way a pass becomes a seat, shared by both.
- **A pass that is not yours is `404`, not `403`.** A holder should not be able to probe for other
  people's passes by reference.
- **Online redemption books `PENDING` with source `WEB`**; the door books `DOOR`/`DOOR`. Both write
  the same £0 `PASS_ADMISSION` ticket, which **does** count against capacity: a pass is an
  entitlement, not a reserved seat.

**`/api/bookings/my-options` is deliberately separate from the show payload.** It is
session-dependent, and `/api/whats-on/:slug` is public and should stay cacheable. It returns the
access types this account may book, with what is left at that performance, and a pass covering it.

---

#### The pass request endpoints

**Source** `server/api/passes/mine/requests.post.ts`, `server/api/pass-requests/**`

**A request is not a pass** (ADR-0028). `POST /api/passes/mine/requests` writes a `pass_requests`
row and **no `passes` row**, so there is nothing that could admit anyone, and the booking flow
offers no pass until the box office has been paid.

- `/api/pass-types/on-sale` is **public and column allow-listed**: name, description, validity,
  active prices and covered shows. A requester cannot ask for something they cannot see.
- Asking twice for the same pass is `409`, so the queue holds one row per person per pass.
- **`quoted_pence` is what the requester was shown, not what they are charged.** Fulfilment takes
  the price id used on the day, and a price belonging to a different pass type is `400`. A pass
  quoted at £35 and sold at the £28 concession is a normal outcome, and the discrepancy is visible.
- **Fulfilment is a sale, so it applies every sale guard.** It calls the same `assertPassSellable()`
  as `POST /api/passes`: status, sales window, price still active, and `maxIssued`. A queue longer
  than the cap therefore stops at the cap instead of issuing every row in it, and a pass type closed
  or expired since the request was made cannot be reopened by working the queue.
- Fulfilling or declining twice is `409` naming the decision already made.
- Fulfilment issues the pass through the normal columns, so `passes.pricePaid` stays a record of
  money actually taken and pass revenue keeps its single source.

---

#### The catalogue endpoints

**Source** `server/api/admin/bar/products/**`, `categories/**`, `discounts/**` · **Auth** `manageBar`

- **Sizes are real, and the API derives the rest.** `containerMl` is millilitres in one container
  (700 for a 70 cl bottle); omit it and the product is counted in whole items (ADR-0035).
- **`recipe` is what a sold product is made of**, one entry per ingredient, each carrying either a
  `componentProductId` or a `choiceCategoryId` and a `qty` in that ingredient's own basis. An
  empty recipe means the product holds its own stock. On `PATCH` it replaces the whole recipe;
  omit it and the recipe is left alone (ADR-0036).
- **A recipe the till could not ring up is refused**, naming which rule it broke: an ingredient
  that does not hold stock, a category with nothing stocked in it, a category that mixes things
  counted in millilitres with things counted in items, an ingredient of itself, or a recipe on
  something another product is made from. Maximum eight ingredients. **The status codes split by
  kind**: an ingredient or category that does not exist, and a product named as an ingredient of
  itself, are `400`; the one-level refusals are `409`, because the target exists and the catalogue
  is simply the wrong shape for it. Pointing an ingredient at something that is itself a recipe is
  `409 An ingredient has to hold its own stock. Point at the bottle, not at a measure of it.`, and
  giving a recipe to a product something else is made from is `409 Something else is made from
  this, so it has to hold stock. Take it out of that recipe first.`
- **One level cuts both ways, so an edit that would empty a live choice pool is `409` too.** A
  product reached through a `choiceCategoryId` is as much an ingredient as a fixed one, and
  retiring it, hiding it, moving it to another category or giving it a recipe of its own would all
  take it out of the pool. `PATCH` therefore recomputes every affected pool as it would be after
  the change whenever `status`, `categoryId` or `recipe` is present, and refuses when one that
  an `ACTIVE` recipe depends on would be left with nothing to pick, naming the dependent product
  and the category. A pool that is *already* empty does not block an unrelated edit. Without this
  the sold product stayed on the menu with an unfillable slot: the tile could never be added to a
  basket, and nothing said why (ADR-0036).
- **A recipe clears the size and the par.** Something made from other things holds no stock of its
  own, so `containerMl` and `parQty` are both nulled whenever a recipe is present, on create and on
  edit alike. A par kept on such a product could never be met: no movement can be written against
  it, so it would sit below par forever and be named in every night report.
- **`containerMl` cannot change once anything has moved.** `409`, naming the fix: retire the
  product and add the new size as its own. Every movement means what it means in the size that was
  current when it was written.
- **`stockOnly` products carry no price and reach no till.** `pricePence` is required unless
  `stockOnly` is set and refused when it is; a recipe alongside it is refused too, because
  something stock-only holds its own stock. `GET /api/bar/tonight`, the tab menu and the
  training mirror all filter them out in SQL rather than relying on the missing price.
- **Retiring is not deleting.** A `RETIRED` product leaves the till and keeps every past sale,
  price row and stock movement exactly as it was.
- **A price is added, never edited.** `POST .../prices` writes a new dated row; a future
  `effectiveFrom` schedules a change and does **not** affect what the till charges today. The
  history is the audit trail, so there is no endpoint that updates a price row. A second price for
  a date already in the history is `409 A price already starts on that date. Date the correction
  from another day.`, decided by the unique index rather than by a prior read, so a repeated POST
  cannot rewrite what a price was or who set it. **The cost is that a figure mistyped today cannot
  be corrected until tomorrow**, because the current price is the latest row dated on or before
  today: see [known issues](./09-known-issues.md#price-typo-same-day) for what to do instead.
- **Editing a discount is not retrospective.** A transaction stores the percentage it was rung up
  at, so changing one here only affects future sales.

---

#### The report endpoints

**Source** `server/api/admin/bar/reports/**` · **Auth** `manageBar`

Every report takes `from` and `to` as `YYYY-MM-DD`, and `format=csv` on the same endpoint returns
the same numbers as a download. **The screen and the export share one query**, so a CSV cannot drift
from what the page showed.

- **`format=csv` returns the whole range, not one page.** A CSV of the first 25 rows is not an
  export. The JSON form pages in SQL and returns the `Paginated<T>` envelope (ADR-0005).
- **`/term` is what the pickers open on.** It resolves the season covering today; where none does,
  it falls back to the last 90 days and *says so* in `name`, rather than silently presenting a
  range as if it were a term.
- **GP scales cost by depletion.** A 175 ml glass costs 175/750ths of its bottle's latest delivery
  cost, not a whole one (`docs/13` §3.1), and a cocktail costs the sum of its ingredients. A choice
  slot is priced at its **dearest** option, so GP is never flattered by assuming the cheap mixer.
  A product with no delivery recorded has a null cost rather than a flattering zero.
- **Variance is reported in both.** The CSV carries `variance (containers)` and the raw level, so
  a half bottle reads as `-0.5` and as `-375 ml`, plus the `reason` recorded against the line on
  the count sheet. An unexplained variance is a blank cell, which is the shrinkage question the
  report is read to answer.
- **One escaper for every CSV in the app** (`server/utils/csv.ts`). A cell that opens with `=`, `+`,
  `-`, `@`, a tab or a carriage return is prefixed with an apostrophe, so Excel reads a refusal note
  typed as `=HYPERLINK(...)` instead of running it. A plain number keeps its value, so a negative
  variance still sums.
- **The register is a PDF because a licensing officer asks for one.** It is generated by
  `server/utils/pdf.ts`, hand-rolled for the same reason as `qr.ts`: the Workers runtime has no PDF
  library. Timestamps are Europe/London, because a register read in UTC is a register read wrong.

---

#### The stock endpoints

**Source** `server/api/admin/bar/stock/**`, `deliveries/**`, `stocktakes/**` · **Auth** `manageBar`

Every level is derived: there is no endpoint that sets on-hand, because there is no column to set.

Everything is entered in **containers**, which is how an invoice and a shelf read; the app
converts to the product's basis with its `container_ml` (ADR-0035).

- **`POST /api/admin/bar/deliveries`** writes the delivery, its lines and one `DELIVERY` movement
  per line in a single batch, one statement each so the parameter count cannot grow with the
  delivery (ADR-0006). `qtyContainers` is whole containers; three cases of twelve is `36`, and six
  70 cl bottles becomes `4200` ml in the ledger. `costPencePerContainer` is per container.
- **`POST /api/admin/bar/stocktakes`** refuses with `409` if one is already open, and snapshots
  `expected_qty` for every active stock product. The refusal is backed by the partial unique index
  `stocktakes_one_open`, so two simultaneous starts give one stocktake and one `409`, never two.
- **`PATCH .../lines`** takes `countedContainers`, a part bottle as a decimal, and reads every
  line's container size in one statement rather than one per line (ADR-0006). It also takes an
  optional `reason` for the line's variance. **The two fields differ deliberately**:
  `countedContainers` is required on every line, and null clears the count; `reason` is optional,
  and an omitted `reason` leaves the stored one alone, so a save that carries only counts cannot
  wipe the explanation. Send `reason: null` to clear it.
- **`POST .../finish`** writes one `STOCKTAKE` movement per line whose count differs from on-hand
  **now**, and refuses if nothing was counted, pointing the caller at abandon instead. The update
  re-asserts `status = 'OPEN'` in its `WHERE`, and `stock_movements_stocktake_line_uq` allows one
  movement per counted line, so two finishes in the same instant give one applied count and one
  rolled-back batch rather than the correction applied twice.
- **`POST .../abandon`** writes no movement at all.
- **`POST /api/admin/bar/stock/adjust`** takes `qtyContainers`, refuses an adjustment aimed at
  something made from other things rather than the product that holds the stock, and requires a
  reason.

---

#### `POST /api/bar/transactions`

**Source** `server/api/bar/transactions.post.ts` · **Auth** `workFoh` then `requireBarScope`: a
`BAR` shift tonight, or `BOX_OFFICE`+

One tap writes **one transaction**, whatever mix of ticket payments and bar items it covers, in a
single `db.batch()` alongside the collection transitions. A `DOOR` shift gets `403` from every
`/api/bar/*` route: the door never sells (docs/13 §5).

- **The discount applies to the bar subtotal only.** Ticket lines are never discounted: ticket
  prices have their own override chain. Line amounts stay **gross**, so product reports are honest
  and "what did we give away" is one sum.
- **Choices are checked, never trusted.** Each bar item may carry `choices`, one `{ itemId,
  productId }` per choice slot. The server resolves them against the catalogue it just loaded, in
  memory rather than with an id list (ADR-0006), and refuses a missing pick or one outside the
  pool **before any money is recorded**. What is written to `transaction_lines.choices` is what the
  catalogue accepted, not what the client sent. Comps validate the same way when the comp is
  *asked for*, so approving one can never be ambiguous.
- **Prices are snapshotted** onto the line, exactly as a ticket's `pricePaid` is.
- **The gold figure is checked, not trusted**: a mismatch is `409` naming both amounts, nothing
  written.
- **Comp is not a tender here yet.** It creates a request and needs duty-manager approval before
  anything is recorded, which is #166; the button is present and disabled until then.

**`GET /api/bar/lookup` is deliberately not night-scoped.** Paying in advance for Saturday is a
designed case (docs/13 §2.2), so a booking for another performance is found, flagged *not tonight*
on its card, and still payable. It returns a first name and what is owed, never an email.

---

#### `PUT /api/reservations/:id`: now also records the money

Collection is the payment boundary
([ADR-0011](./decisions/0011-collection-is-the-payment-boundary.md)) and therefore the moment the
money is recorded ([ADR-0023](./decisions/0023-money-taken-is-recorded-as-a-transaction.md)). Moving
a reservation into `COLLECTED` or `DOOR` writes a `transactions` row with a `TICKET_PAYMENT` line,
**in the same `db.batch()` as the status change**: both, or neither.

Two optional fields:

- **`expectedTotalPence`**: what the screen showed. Checked, not trusted: the customer typed that
  figure into a card reader, so a disagreement is a real one and returns `409` with both amounts,
  having written nothing.
- **`tender`**: `CARD` (default) or `COMP`. A comp records `0` and who approved it. Its ticket lines
  still carry the full price, so reversing a comped booking goes down the refund path like any other
  collected booking; the refund gives no money back and is therefore in neither the day's expected
  Z-total nor the night report's refunded figure.

The amount is the sum of **unrefunded tickets at the price they were sold at**, never the current
price.

---

#### `POST /api/shifts/:id/claim`

**Source** `server/api/shifts/[id]/claim.post.ts` · **Auth** any logged-in member

Eligibility is asked of `rehearsal` through **one seam**, `isEligible(userId, ruleKey)`
([ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)). This app never
encodes what a rule requires, only that there is one, so the committee can change the requirement in
rehearsal's admin UI without a deploy on either side.

**It fails open, with a flag.** If rehearsal cannot be reached and no cached answer exists, the claim
is allowed and `needsEligibilityReview` is set, which the admin rota renders as a *check training*
badge. Failing closed would empty the rota during a training outage, and an unstaffed performance is
a real harm tonight; an unqualified claim is a flagged row a human reviews. A claim on that path is
**never auto-confirmed**, whatever the season's toggle says.

A `404` from rehearsal means a rule was renamed or removed. That is a configuration break, not a
transient, and it is logged loudly rather than quietly treated as an outage.

**Response** `200`: the updated shift. `409` if somebody got there first, `403` with the missing
module codes when rehearsal says no.

---

#### `DELETE /api/shifts/:id`

**Source** `server/api/shifts/[id]/index.delete.ts` · **Auth** `authorize(event, manageShifts)`

Removes the slot outright. A shift is a plan, not a sales record, so this is a real delete rather
than an archive ([ADR-0010](./decisions/0010-archive-never-delete-referenced-records.md) covers
referenced records; nothing references a shift).

**Response** `200`: `{ ok: true }`. `404` if it does not exist.

---

### 3.10 Admin

Both admin endpoints declare their ability **inline** rather than importing from `shared/utils/abilities/`:

```ts
await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))
```

Effective access is ADMIN or MANAGER. BOX_OFFICE is excluded. If you add another admin endpoint, consider promoting this into a named ability instead of repeating it.

---

#### `GET /api/admin/reservation-counts`

**Source** `server/api/admin/reservation-counts.get.ts` · **Auth** `authorize(event, listReservations)`: staff

Reservation totals by status, as one `GROUP BY` returning at most five rows. It backs the box-office status pills, which would otherwise be five `filter().length` passes over every reservation in the browser.

**Query**

| Name | Type | Notes |
| --- | --- | --- |
| `performanceId` | string, optional | Count one performance |
| `showId` | string, optional | Count every performance of one show, via a subquery ([ADR-0006](decisions/0006-d1-bound-parameter-limit.md)) |

Both are optional; with neither, the counts cover every reservation.

**Response** `200`: `byStatus` always carries all five keys, zero-filled, so a caller need not handle a missing status:

```jsonc
{ "byStatus": { "PENDING": 12, "COLLECTED": 40, "DOOR": 3, "CANCELLED": 1, "NO_SHOW": 0 }, "total": 56 }
```

---

#### `GET /api/admin/stats`

**Source** `server/api/admin/stats.get.ts` · **Auth** inline ability: ADMIN or MANAGER

**Query** `from` and `to`, both optional, both `YYYY-MM-DD`, bounding performance dates
inclusively. Omit them and the window is **the current season**, 1 August to 31 July, which is the
university year and the committee handover.

**The season boundary is resolved in Europe/London**, like the window bounds it feeds. Resolved in
UTC it is wrong for the hour after midnight on 1 August, when the Worker still reads 31 July: the
dashboard would default to the season that had just ended and report it as the current one. The
response echoes the resolved window as `window` (`from`, `to`, `isCurrentSeason`), which is what
the dashboard heading is built from.

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

**Revenue definition: get this right when reporting to the treasurer.** Revenue and `totalTicketsSold` count only tickets whose reservation status is `COLLECTED` or `DOOR`, and whose `refundedAt` is null. `PENDING` reservations are pre-bookings where no money has changed hands and are deliberately excluded, as are `CANCELLED` and `NO_SHOW`. `reservationsByStatus`, by contrast, counts **all** statuses. `revenueByShow` is ordered by revenue descending and only includes shows with at least one qualifying ticket.

`recentReservations` are the ten most recently created, regardless of status, with `user` (id, name, email) and `performance` → `show` (id, title) and `venue` (id, name). There are no `tickets` on these entries.

**Errors** `403` for BOX_OFFICE and everyone else.

---

#### `GET /api/admin/export/tickets`

**Source** `server/api/admin/export/tickets.get.ts` · **Auth** inline ability: ADMIN or MANAGER

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

**`400`** if none of the four is supplied: the whole archive is too large to build in one request. **`400`** again if the filters still match more than 20,000 tickets, which the CSV is assembled in memory in a single Worker.

**Response** `200`: a CSV body, not JSON, with:

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

One row per ticket, ordered by show title, then performance start, then booking reference. Cells containing a comma, quote, or newline are quoted with doubled inner quotes, and a cell opening with a spreadsheet formula character is neutralised by the shared escaper described under the bar report endpoints. **Every reservation status is included** (cancelled and no-show rows appear too) so the treasurer has a full audit trail; filter on the Status and Refunded columns rather than assuming the file is a revenue report.

When `showId` matches a show with no performances, an empty CSV (headers only) is returned with the generic filename `nnt-tickets.csv`.

**Errors** `403`; `400` on a non-string query value.

**Side effects** None: read-only. The whole file is built in memory as a single string, so a very large export is bounded by Worker memory.

---

### 3.10a Health

---

#### `GET /api/health`

**Source** `server/api/health.get.ts` · **Auth** **Public**: no `authorize()`, no `requireUserSession()`

The one endpoint in this app where an unguarded handler is deliberate rather than a bug: uptime
monitoring cannot hold a session, and the response carries no personal data. Everywhere else in this
document, a missing guard means an open endpoint.

It answers two questions: whether the migration journal compiled into the running build matches the
`_hub_migrations` ledger in the database, and whether this isolate actually holds the session key.

**Response** `200` when both are well:

```json
{ "ok": true, "sessionKey": "ok" }
```

**Response** `503` when the schema is behind the deployed code, naming the files:

```json
{ "ok": false, "pendingMigrations": ["0017_rich_husk"], "sessionKey": "ok" }
```

**Response** `503` when the Secrets Store read failed, so no request can be served safely:

```json
{ "ok": false, "pendingMigrations": [], "sessionKey": "missing" }
```

This endpoint is the **only** path exempt from `server/middleware/0.session-key.ts`, which 503s
everything else while the key is missing ([ADR-0040](decisions/0040-refuse-a-request-with-no-session-key.md)).
The exemption is what lets monitoring see the cause instead of a bare 503.

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
the second half of stage-door ADR-0021: the first half being the workflow this repo already had.
### 3.10a2 Show night

---

#### `GET /api/foh/tonight`

**Source** `server/api/foh/tonight.get.ts` · **Auth** `authorize(event, workFoh)`: `foh.work`

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

Anyone without `foh.work` gets `403`, including anonymous callers: `defineAbility` with a single
argument denies guests (§1).

---

#### `GET /api/foh/lookup`

**Source** `server/api/foh/lookup.get.ts` · **Auth** `authorize(event, workFoh)`: `foh.work`

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
| `standing.amountOwedPence` | - | ✅ |
| `firstName` | ✅ | - |
| `customerName`, `customerEmail` | - | ✅ |
| `tickets` with `pricePaid` | - | ✅ |

The door's job is admit or redirect, so it gets the verdict and the head count and **no money at
all, including what is owed**: that figure is the bar's
([11-show-night-screen-design](./11-show-night-screen-design.md) §2.1). Allow-listed rather than
deleted, so a column added later is private until someone decides otherwise.

`standing` comes from `bookingStanding()`, the single definition of paid versus unpaid
([ADR-0011](./decisions/0011-collection-is-the-payment-boundary.md)). The bar till will call the
same function; do not write a second one.

**Response** `200`: an array, possibly empty. A booking for another night is simply not found here,
which is deliberate: the rota scope is a boundary, not a convenience.

---

#### `/api/backstage/**` and `/api/foh/backstage`

**Source** `server/api/backstage/*`, `server/api/foh/backstage/*` ·
Design: [11-show-night-screen-design](./11-show-night-screen-design.md) §5,
[ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md)

A backstage device holds **no user session**. `requireBackstageSession()` reads a separate
`nnt-backstage` cookie and returns a session with no identity attached, so nothing on this path can
reach a user even by accident. This app never writes `nnt-session` outside `/dev-login`, and the
backstage cookie is not that cookie.

**The code is never stored.** It is derived by HMAC from the night and the epoch; the database holds
only those two. `POST /api/foh/backstage/reset` bumps the epoch, which changes the code and
invalidates every session in one write, logs an incident entry and emails `boxoffice@`: audited and
announced, so it stays free to use liberally.

**Two limits guard joining.** The rate limiter caps attempts per caller
([ADR-0015](./decisions/0015-rate-limits-declared-in-middleware.md)), and the night counts failures
across *all* devices: past the threshold it rotates its own epoch. A distributed guesser therefore
achieves a code reset, never a join.

`GET /api/backstage/emergency` is **deliberately public**: no session of either kind. Safety
information is never behind a lock (§5.1), so a device that has not joined can still read the 999
address and the assembly point. It is allow-listed to the emergency card and rate limited; nothing
about who is coming, what was sold or who is working crosses that boundary.

**Response** `{ night, cards }`. The night travels with the cards because `/backstage` mirrors the
payload to `localStorage` and renders it when the fetch fails, and a saved copy has to be able to
say which night it is from. Note that `cards` is empty **only** when no performance is scheduled: the
join to `venue_emergency_info` is a LEFT JOIN, so a venue with nothing recorded still returns a row.
An empty array on a show night therefore means the request failed, which is why the page
distinguishes a failure from a dark night rather than printing one sentence for both.

A joined backstage device gets **403 from every `/api/foh/*` and box-office route**, because those
require a user session it does not have. That is the property to preserve if this ever changes.

---

#### The comms board

**Source** `server/api/backstage/board.get.ts`, `server/api/backstage/messages/**`,
`server/api/foh/backstage/**` · Design: [11-show-night-screen-design](./11-show-night-screen-design.md)
§2.4, [ADR-0021](./decisions/0021-show-night-comms-poll-rather-than-hold-a-socket.md)

**Polled, with a cursor.** `?since=<epoch ms>` returns only messages created after it. Clients also
drop the cursor periodically, because an acknowledgement changes a message the client *already
holds* and a cursor by definition cannot see that. Rate limits are set from the poll interval rather
than guessed ([ADR-0015](./decisions/0015-rate-limits-declared-in-middleware.md)).

Two rules the handlers enforce, not the UI:

- **You may only send your own side's presets.** A backstage device posting a front-of-house preset
  id gets `404`, because a preset carries a direction.
- **You may only acknowledge the other side.** Acking your own message is `404`. The entire value of
  the board over a group chat is one side seeing the other has read it, so acking yourself would be
  a way to fake exactly the thing it exists to prove.

`GET /api/backstage/board` also returns the **house count**: admitted against expected, and nothing
else. That is the one piece of box office data that crosses to backstage (§5.2), and it is computed
by the shared seat rule ([ADR-0007](./decisions/0007-one-seat-counting-rule.md)) rather than counted
again here. **It is one performance's pair, not the day's**: the last performance whose doors have
opened, else the next to start, else the day's last, excluding anything at an external venue. The
title, start time and interval count returned beside it belong to that same performance.

The FOH side is scoped by the rota like every other show-night route: all five
`/api/foh/backstage/**` routes call `requireRosteredTonight()` after `requireFohScope()` and answer
`404 You are not working tonight.` to a role holder with no confirmed shift, so an off-duty volunteer
cannot send what the wings read as an authentic call. The backstage side takes a code session and
never a user.

`GET /api/foh/backstage/board` also returns **`timings`**: the night's curtain-up record, derived
from preset transitions. The *first* time a milestone was called is the one that counts, and the
list is ordered as a night runs rather than as calls happened, so a missed call reads as a gap
instead of reordering the rest. This is what the end-of-night report will read
([12-access-and-staffing](./12-access-and-staffing-design.md) §4.3).

---

#### `GET /api/foh/access-tonight`

**Source** `server/api/foh/access-tonight.get.ts` · **Auth** `authorize(event, workFoh)`, then the
visibility rule in `server/utils/accessVisibility.ts`

**`BOX_OFFICE` gets no bypass here**, and that is the one thing to preserve. Every other show-night
surface lets `BOX_OFFICE` see past the rota; this one does not, because selling someone a ticket is
not a reason to read their access needs
([ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)). The rule is:

1. a **confirmed shift on this performance**, **on the day of that performance**; or
2. `access.verify`.

and on top of that, the profile must be `VERIFIED`, unexpired, and carry a **consent timestamp**.
No consent, nothing shown, whatever anyone holds.

**It returns an empty list rather than 403** when the caller is not admitted. A 403 would confirm
there was something to see; an empty list is what a performance with no access bookings looks like,
and the two should be indistinguishable.

The same rule decorates the scanner result, asked **per performance** rather than once for the
night.

Verified: a rostered volunteer sees the symbols, `BOX_OFFICE` sees `[]` and no symbols on scan,
`FOH_MANAGER` sees them, a joined backstage device gets `403` and its board payload contains no
access field at all, and withdrawing consent empties it while leaving the profile intact.

---

#### `GET /api/foh/glance`

**Source** `server/api/foh/glance.get.ts` · **Auth** `authorize(event, workFoh)`: `foh.work`

`{ performanceId }`, scoped like every other show-night route.

Returns `numbers` and `show`. **Every seat figure goes through `countOccupiedSeatsFor()`**
([ADR-0007](./decisions/0007-one-seat-counting-rule.md)): a second count here would be a second
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

**Source** `server/api/foh/*` · **Auth** `authorize(event, workFoh)`: `foh.work`

All take a `performanceId` and run it through `scopedPerformance()`, which **404s anything not in
tonight's scope**. A performance id from elsewhere is not a way round the rota, so the check is one
function and every show-night route calls it
([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).

- **`emergency`** returns the venue's card, or `null` where none is recorded. A venue with no card
  still answers: nothing on this path is worth a failed request, because it is the one screen that
  has to work when everything else is going wrong.
- **`contacts`** returns `{ onTonight, contacts }`. `onTonight` is **names and roles only**: the
  mirror holds no phone numbers, and a colleague's email is not the door's business. The numbers
  come from the admin list.
- **`incidents`** lists in reverse order, and `POST` appends. **There is deliberately no update or
  delete route**, and the database refuses both anyway (migration `0019`). A correction is a new
  entry carrying `supersedesId`; both stay, in order
  ([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)).

#### `/api/admin/foh/**`

**Auth** `authorize(event, manageFohReference)`: `foh.manage`, held by `ADMIN`, `MANAGER` and
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

### 3.10c Training mode

---

Sandboxes on the till, Challenge 25 and the door, reachable only while `rehearsal` says the caller
is being taught the thing ([14-training-mode](./14-training-mode-design.md),
[ADR-0032](./decisions/0032-training-mode-writes-to-its-own-table.md)).

**These are parallel routes on purpose.** The real handlers under `/api/bar/**` and `/api/foh/**` are
not modified, take no training parameter and have no training branch, so a practice request cannot
reach the code that moves money, depletes stock or transitions a reservation. Every route here
reuses the same **pure** helpers (`currentPrices`, `buildTransaction`, `basketMovements`,
`bookingStanding`) and none of the persistence.

**The only tables any of them write are `training_runs` and `training_run_events`.**

| Method | Route | Auth | Does |
|---|---|---|---|
| POST | `/api/training/start` | `foh.work` + an open window | Opens a run. 403 unless rehearsal says the window is open |
| POST | `/api/training/end` | `foh.work` | Ends it and deletes its events. Idempotent |
| GET | `/api/training/state` | `foh.work` | Active, time left, tally. **Re-asks rehearsal**, so a lead closing the register ends the run within a poll |
| GET | `/api/training/available` | `foh.work` | Which sandboxes could be opened. Empty for everybody else, so the FOH home shows no tile |
| GET | `/api/training/bar/tonight` | `foh.work` + run: `bar-till` | Live catalogue and prices, fixture performances |
| GET | `/api/training/bar/lookup` | `foh.work` + run: `bar-till` | The fixture, shaped for the Tickets tab |
| POST | `/api/training/bar/transactions` | `foh.work` + run: `bar-till` | Real arithmetic including the expected-total check; writes a `SALE` event |
| GET/POST | `/api/training/foh/age-checks` | `foh.work` + run: `challenge-25` | This run's own entries. Never the real register |
| GET | `/api/training/foh/lookup` | `foh.work` + run: `door-scan` | Searches the fixture only |

Each surface route requires a run **for that target**, so an open till sandbox cannot reach the door.
The fixture is `shared/utils/trainingScenario.ts`; no row of it is ever inserted anywhere. Its nights
are **dated against tonight** rather than being constants, and `isTonight` on the till's lookup is
decided by the same `showNightDate` plus `validityStart`/`validityEnd` window the real routes use
([ADR-0045](./decisions/0045-the-practice-fixture-dates-itself-against-tonight.md)). So
`/api/training/bar/tonight` returns tonight's fixture performances only, `/api/training/foh/lookup`
searches tonight's bookings only (as the real door lookup does), and `/api/training/bar/lookup` is
deliberately not night-scoped, which is what makes the advance-payment case practisable.

**Both halves of that auth column are checked on every request.** The role decides whether there is a
sandbox at all and the run decides which one, because a run row outlives a revoked role: rehearsal's
`expires_at` can be hours away, and a member stood down mid-term would otherwise keep the sandbox
after `state` and `end` had begun refusing them
([ADR-0044](./decisions/0044-a-practice-run-is-not-a-substitute-for-the-role.md)).

`server/middleware/trainingMode.ts` closes the loop from the other side: while a run is open, any
request to `/api/bar/**` or `/api/foh/**` answers `409`, **reads included**, except a named allow-list
of show-night shell reads (`/api/foh/tonight`, `/emergency`, `/contacts`). Belt and braces.

`POST /api/training/start` answers `403` both when the caller is not being taught the thing and when
rehearsal cannot be reached, with different messages: opening a sandbox needs a positive answer
(ADR-0033). It is also how a trainee **switches** sandbox, and that switch is one `db.batch`: the old
run is ended, its events deleted and the new run inserted together, with every refusal answered
before the batch runs. A declined or failed switch therefore leaves the sandbox they already had
untouched, rather than leaving them with none.

`GET /api/training/state` ends a run only on a definitive closure, never on an outage
([ADR-0034](./decisions/0034-an-open-sandbox-closes-only-on-a-definitive-answer.md)).

**Not in any sandbox:** opening or closing a bar session, comps (they need a duty manager's approval,
and a fictional approval teaches the wrong lesson), voids, and anything under `/admin`.

**No route serves the practice ticket sheet.** `/foh/practice-tickets` renders the fixture's QR codes
for a trainer to print, and does it in the page with no fetch of any kind, so it needs no run, no
practice window and no network ([ADR-0043](./decisions/0043-practice-tickets-print-ahead-of-the-lesson.md),
[14-training-mode §5.4](./14-training-mode-design.md)).

---

### 3.11 Media

#### `GET /images/**`

**Source** `server/routes/images/[...pathname].get.ts` · **Auth** **Public: no `authorize()`**

The only handler outside `server/api/`. Streams an object out of the Cloudflare R2 bucket (`proscenium-blob`) by pathname, e.g. `/images/shows/abc123/image-1712345678.jpg` serves the blob at `shows/abc123/image-1712345678.jpg`.

**Response** `200`: the raw object with its stored content type, plus `Content-Security-Policy: default-src 'none';` to neutralise any HTML or script that reaches the bucket. `404` when the pathname does not exist.

**Side effects** None. Anything written to the bucket is publicly readable by anyone who knows or guesses the pathname: uploads are stored with `access: 'public'`. Do not put anything sensitive in blob storage.

---

## 4. Cross-cutting notes for maintainers

**Nothing is transactional.** Every multi-step write (create reservation then insert tickets, create user then insert roles, replace venue features) runs as separate statements. A failure midway leaves partial state. If you are adding a multi-row write, consider whether an orphan is tolerable.

**Capacity is enforced in exactly one place.** `POST /api/bookings` is the only handler that checks it, and it does so with a non-atomic read-then-write. `POST /api/reservations` and `PUT /api/reservations/:id/tickets` do not check at all. `isSoldOut` on `/api/whats-on/:slug` is presentational.

**Emails are sent from five places:** registration and verification requests, password resets (self-service, admin-triggered, and new-user), booking confirmation (`POST /api/bookings`), and booking cancellation (`PUT /api/reservations/:id` on the transition into `CANCELLED`). The two booking emails are fire-and-forget with `waitUntil`; all the others are awaited and will fail the request with a 500 if Resend is down.

**Email links depend on `runtimeConfig.public.baseUrl`,** which the email helpers read as `baseUrl` while `nuxt.config.ts` defines `baseURL`. Check that the deployed environment actually sets the key the helper reads before trusting any emailed link.

**`server/utils/` is auto-imported.** `authorize`, `allows`, `db`, `schema`, `createError`, `getUserSession`, `requireUserSession`, `hashPassword`, `verifyPassword`, plus everything in `server/utils/*.ts` (`sendEmail`, `validateAndUploadImage`, `loadTicketPriceContext`, `resolveEffectivePrice`, `formatUserResponse`, `reservationDetailWith`, …) are available without an import statement. Abilities are the exception: they are imported explicitly from `~~/shared/utils/abilities`.

**Restrict-vs-cascade, at a glance.** Deletes that cascade: show → performances → their overrides; ticket type → its overrides; user → roles, verification and reset tokens; venue → feature links; feature → venue links. Deletes that are *restricted* by a foreign key and will therefore fail: anything with issued `tickets` (performance, ticket type, reservation) and any user with a reservation. Only the performance and ticket-type delete handlers convert that failure into a friendly 409; the rest surface as a 500.
