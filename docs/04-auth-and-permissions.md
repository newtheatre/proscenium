# Auth and permissions

**Identity is not this app's job.** Since the estate cut over to
[stage-door](https://github.com/newtheatre/stage-door) on 2026-08-12, `auth.newtheatre.org.uk` owns
accounts, credentials, roles and erasure. Proscenium reads a sealed cookie and keeps a thin mirror
of the people who have booked something. There are no passwords, no login pages and no role editing
in this repo, and there must never be again — see stage-door's
[integrating-an-app](https://github.com/newtheatre/stage-door/blob/main/docs/integrating-an-app.md).

## Sessions

The `nnt-session` cookie is sealed by the auth service with the estate-wide
`NUXT_SESSION_PASSWORD` and scoped to `.newtheatre.org.uk`, so every app reads the same session.
**This app only ever reads it.** The single sanctioned exception is `/dev-login`, guarded by
`import.meta.dev` so it does not exist in a production build.

The payload is the published contract, copied into `shared/utils/nntAuth.ts` (do not edit it here —
change it in stage-door and re-copy):

```ts
interface User {
  id: string; email: string; name: string
  verified: boolean
  guest: boolean            // true = shadow account, no password ever set
  roles: string[]           // scoped: 'proscenium:ADMIN', 'rooms:ADMIN', …
}
interface UserSession {
  loggedInAt: number        // epoch ms
  refreshedAt: number       // epoch ms of the last DB re-read — drives staleness
  epoch: number             // copy of users.session_epoch — drives force-logout
}
```

**Roles are namespaced.** They arrive as `proscenium:ADMIN`, not `ADMIN`, because one session
carries every app's roles. Never compare against a bare role name — use `hasRole`/`isStaff` from
`shared/utils/abilities/types.ts`, which add the prefix. Writing the list out by hand is how the
staff branch of `requireBookingAccess` silently never matched.

Login and account links point at the auth service:

```
https://auth.newtheatre.org.uk/login?redirect=<url-encoded current page>
https://auth.newtheatre.org.uk/account
```

### Staleness, not epochs

Roles are a snapshot taken when the auth service last read its database. A session whose
`refreshedAt` is older than **15 minutes** (`ROLE_STALENESS_MS`) must not have its roles honoured;
the browser is bounced through `auth.newtheatre.org.uk/api/session/refresh`, which re-reads roles
and rejects revoked or disabled accounts. That refresh is where the `session_epoch` check lives —
this app never queries it.

Sessions with no `proscenium:` role are never staleness-checked, so ordinary audience browsing
never touches the auth service.

Server-side this is `server/utils/session.ts`, and it has one rule worth reading before you touch
it:

> **`sessionUserForAuthorization` must never throw.**
>
> `nuxt-authorization`'s server `authorize()` wraps its resolver in a try/catch that only re-throws
> `AuthorizationError`; anything else is swallowed and `authorize()` then resolves *successfully*,
> running the handler with no check at all. A resolver that threw on stale sessions therefore turned
> the staleness rule into a privilege escalation — and because sessions last 30 days and go stale
> after 15 minutes, that was the ordinary state of a staff session, not an edge case.
>
> Staleness is expressed as data instead: a stale session keeps its identity and loses its
> `proscenium:` roles. Staff abilities fail closed; ownership checks still work.

`getVerifiedSessionUser` *does* throw a 401 with `data: { stale: true }`, which is correct for
handlers that call it directly — the throw propagates normally there. Do not wire it into the
resolver.

**Rotating `NUXT_SESSION_PASSWORD` invalidates every session estate-wide.** That is the emergency
lever, and it also invalidates every outstanding booking link unless `NUXT_BOOKING_TOKEN_SECRET` is
set separately. See [08-operations](./08-operations.md).

## Accounts

`users` here is a mirror: `id`, `email`, `name`, `anonymisedAt`, timestamps. Nothing that describes
the *person* rather than their relationship to this app belongs in it.

| | Where it comes from |
|---|---|
| Registered customer / staff | Created centrally; mirrored on first authenticated request |
| **Shadow account** | Guest checkout or staff walk-in calls `POST /api/users/shadow` on the auth service, then mirrors the returned id |
| Anonymised | Erased centrally; see below |

The mirror upsert is `server/utils/ensureLocalUser.ts`, run from the authorization-resolver plugin
and debounced per isolate. Canonical ids are stable forever and `reservations.user_id` FKs against
them — never invent a user id the auth service did not issue.

## Erasure {#erasure}

Erasure is **anonymisation, never deletion**: `reservations.user_id` is `restrict` and sales records
carry a six-year retention, so the booking survives and the person is removed from it.

The supported route is central. stage-door's `eraseUser` rewrites the auth identity, deletes
credentials, tokens and roles, bumps `session_epoch`, then calls every registered app's hook and
retries until each succeeds:

```
POST /api/_hooks/auth/anonymise { userId }  →  { ok: true }
```

Ours is `server/api/_hooks/auth/anonymise.post.ts`, delegating to `anonymiseUser`, which rewrites
the mirror row and scrubs **both** reservation note fields (`customerNotes` and `staffNotes` — a
staff note saying who collected the tickets identifies someone just as well as a name). It writes
byte-identical values to stage-door's — `deleted-<userId>@anonymised.invalid` and `Deleted user` —
because the mirror is upserted *from the session*, so a locally-invented placeholder would be
overwritten by the central one on the next refresh. Deriving the address from the user id also makes
the hook genuinely idempotent, which stage-door's retry loop assumes.

Two things that are easy to get wrong here:

- **The mirror upsert must not resurrect an erased row.** It runs on every authenticated request and
  writes name and email from the session. A customer holds no roles, so their sealed cookie stays
  readable for the full 30-day `maxAge` after erasure — their own browser used to restore their
  details while `anonymisedAt` kept the row hidden from listings, so the erasure looked complete and
  silently was not. `ensureLocalUser` now carries `setWhere: isNull(anonymisedAt)`.
- **There is no app-local erasure endpoint**, deliberately. One used to exist and produced a half
  erasure — this app scrubbed, the central identity untouched — which is worse than none.

The other hooks are `export` (subject-access contribution), `last-activity` (feeds the
retention sweep; stage-door batches ids at 90 and so do we, because D1 binds at most 100 parameters
per statement) and `merge` (stage-door ADR-0015: re-points every user-referencing column —
reservations, passes, and the two staff-attribution columns — onto the winning account and deletes
the losing mirror row; the losing central identity is erased by stage-door afterwards). All four
authenticate with the SHA-256 of this app's own `AUTH_SERVICE_TOKEN`, compared constant-time — see
`server/utils/hookAuth.ts`.

Full policy: stage-door's
[gdpr-retention](https://github.com/newtheatre/stage-door/blob/main/docs/gdpr-retention.md).

## Roles

Five roles in the `proscenium` namespace. No role at all is the customer case.

| Role | Intended holder |
|---|---|
| `proscenium:ADMIN` | IT Manager, and normally the Theatre Manager |
| `proscenium:MANAGER` | Box Office Manager, committee members who programme shows |
| `proscenium:BOX_OFFICE` | Box office staff: sells, admits, takes money |
| `proscenium:FOH_MANAGER` | Runs the rota and verifies access profiles. Not a seller |
| `proscenium:FRONT_OF_HOUSE` | Door volunteers. No prices, no emails, no money |

Granted in the auth service's admin UI; there is no code registration step and no way to change a
role from this app.

**`FRONT_OF_HOUSE` is not a tier below `BOX_OFFICE`.** This app has no tiers: a role is a *set of
permission keys*, and that role's set is narrower and differently shaped. It is also the one role
whose usefulness depends on data rather than on the grant, because a confirmed shift on tonight's
performance is what scopes it ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).
Holding it while not rostered shows nothing.

The helpers are in `shared/utils/abilities/types.ts`, and each resolves a permission key rather
than naming roles:

```ts
export function isAdminOrManager(user: AbilityUser): boolean   // programme.manage
export function isStaff(user: AbilityUser): boolean            // staff.access
export function isAdmin(user: AbilityUser): boolean            // catalogue.delete
export function canWorkFoh(user: AbilityUser): boolean         // foh.work
export function canManageShifts(user: AbilityUser): boolean    // shift.manage
export function canManageFoh(user: AbilityUser): boolean       // foh.manage
```

### Permission keys

`shared/utils/appManifest.ts` is the single declaration of what this app's roles can do, and it is
served to the auth service at `/api/_hooks/auth/manifest`. Role definitions come only from
manifests (stage-door ADR-0024), so adding a role or a permission is a change to that file and
nothing else.

| Key | What it admits |
|---|---|
| `staff.access` | Box-office and back-office surfaces |
| `reservation.manage` | List, create and amend reservations; issue and redeem passes |
| `programme.manage` | Venues, shows, performances, ticket types, pass products |
| `money.refund` | Refund a ticket, delete a reservation, cancel an issued pass |
| `user.manage` | Rows in the local user mirror |
| `catalogue.delete` | Delete programme records outright |
| `user.delete.any` | Delete another person from the mirror |
| `foh.work` | Reach the show night screen for a performance you are rostered on |
| `shift.manage` | Assign, confirm and reassign shifts |
| `access.verify` | Verify access profiles, and read them outside show night |
| `bar.manage` | The bar catalogue, stock, voids and exports |
| `foh.manage` | The emergency card and the front-of-house contact list |

`access.verify` is deliberately **not** carried by `BOX_OFFICE` or `MANAGER`: selling someone a
ticket is not a reason to read their access needs
([ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)).

## The ability system

Permissions are declared as abilities in `shared/utils/abilities/*.ts` and re-exported from
`index.ts`. Because they live in `shared/`, the same rule runs on the server
(`authorize(event, ability)`) and on the client (middleware, conditional rendering).

**Three things to know before you add an endpoint:**

1. **A handler with no `authorize()` and no `requireUserSession()` is fully public.** There is no
   route-level middleware over `/api/**`. Forgetting the guard is not a subtle bug, it is an open
   endpoint — it has already happened once, with `GET /api/shows` exposing DRAFT productions.

2. **`defineAbility(fn)` with a single argument sets `allowGuest: false`.** So an ability that
   *looks* public, like `readShow = defineAbility(() => true)`, denies anonymous users when passed
   through `authorize()` — it means "any logged-in user". Denial surfaces as **403**, not 401. If
   you genuinely want a public endpoint, do not call `authorize()` at all.

3. **An ability that admits the resource owner must not return the staff shape.** `readReservation`
   admits the booking's own customer, so `GET /api/reservations/:id` picks its column allow-list
   from `isStaff()`. Returning the staff shape to an owner published `staffNotes` and `legacyRef`.
   Customer-facing shapes live in `server/utils/queries/reservations.ts`.

## Permission matrix

Roles not listed in a row hold nothing for that area. `FOH_MANAGER` and `FRONT_OF_HOUSE` appear
only where they hold something, which is deliberately little.

| Area | ADMIN | MANAGER | BOX_OFFICE | Customer |
|---|---|---|---|---|
| Shows: create / update / publish | ✅ | ✅ | — | — |
| Shows: delete | ✅ | — | — | — |
| Performances: create / update / delete | ✅ | ✅ | — | — |
| Venues & features: create / update | ✅ | ✅ | — | — |
| Venues & features: delete | ✅ | — | — | — |
| Ticket types: create / update | ✅ | ✅ | — | — |
| Ticket types: delete | ✅ | — | — | — |
| Pass types: create / update (incl. on sale) | ✅ | ✅ | — | — |
| Passes: issue / redeem | ✅ | ✅ | ✅ | — |
| Passes: cancel | ✅ | ✅ | — | — |
| Reservations: list / create / read / update | ✅ | ✅ | ✅ | own only |
| Reservations: refund | ✅ | ✅ | — | — |
| Reservations: delete | ✅ | ✅ | — | — |
| Users (mirror): list / read | ✅ | ✅ | ✅ | self |
| Users (mirror): create / delete | ✅ | ✅ | — | — |
| Admin stats & CSV export | ✅ | ✅ | — | — |
| Rota: read | ✅ | ✅ | ✅ | — |
| Rota: assign / confirm / remove | ✅ | ✅ | — | — |
| Emergency card and contacts: edit | ✅ | ✅ | — | — |

Plus the two front-of-house roles:

| Area | FOH_MANAGER | FRONT_OF_HOUSE |
|---|---|---|
| Show night screen (rostered performances only) | ✅ | ✅ |
| Rota: read | ✅ | ✅ |
| Rota: assign / confirm / remove | ✅ | — |
| Emergency card and contacts: edit | ✅ | — |
| Access profiles: verify and read | ✅ | — |
| Prices, emails, taking money | — | — |

Credentials, role assignment and verification are absent from this table on purpose: they are the
auth service's, and the abilities that used to describe them have been removed rather than left
implying a permission model this app does not enforce.

Note the row that matters operationally: **`BOX_OFFICE` can list and read every mirror user.** The
walk-in lookup uses `GET /api/users?email=`, which returns at most one row rather than the table.

## Client-side guards

`app/middleware/` — `auth`, `admin`, `staff`, `foh`. These are **user experience only**. They stop someone
landing on a page they cannot use; they are not a security boundary. The API is the boundary. Each
checks staleness *before* the role, so a session that is merely out of date is refreshed rather than
turned away.

`/admin/*` uses `admin` (ADMIN or MANAGER). `/admin/box-office/*` uses `staff` (adds BOX_OFFICE).
`/foh/*` uses `foh`, which checks `foh.work` and nothing more: **which performances that person may
see is the rota's answer, not the middleware's**, and it is given server-side
([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)). A holder rostered on
nothing reaches the page and is told so, which is a state rather than a denial.

## Guest booking access

A customer with no account still needs to open their own booking from an emailed link. That is a
signed, expiring token (`server/utils/bookingToken.ts`), not the booking reference — the reference
is quoted aloud at the box office and printed on every email, so it cannot also be the key.

The token is HMAC-SHA256 over `{ bookingId, expiry }`, expiring a day after the performance and
never sooner than a week out. It is signed with `NUXT_BOOKING_TOKEN_SECRET`, **which falls back to
the estate session password when unset** — set it explicitly in production, or one key serves two
different credential types across a trust boundary and a seal rotation kills every booking link
already in customers' inboxes.
