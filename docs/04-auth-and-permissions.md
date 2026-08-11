# Auth and permissions

## Sessions

`nuxt-auth-utils` sealed cookie sessions. The session payload is declared in
`shared/types/auth.d.ts`:

```ts
declare module '#auth-utils' {
  interface User {
    id: string; email: string; name: string; verified: boolean
    roles: Array<'ADMIN' | 'MANAGER' | 'BOX_OFFICE'>
  }
  interface UserSession { loggedInAt: Date }
}
```

Login (`POST /api/auth/login`) verifies the password, loads the user's roles, calls `setUserSession`
and updates `lastLogin`.

**Roles are snapshotted into the cookie at login.** A role granted or removed in the admin UI does
not take effect until that person logs in again. Demoting a volunteer mid-shift does nothing until
they close their browser. Self-edits are the exception — `PUT /api/users/:id` calls
`replaceUserSession` when you edit yourself.

The fix, when someone gets to it, is the session-epoch approach the auth service plan already
specifies: a `sessionEpoch` integer on `users`, embedded in the session, checked on refresh. About
twenty lines, and it also buys a "force logout" button.

**Rotating `NUXT_SESSION_PASSWORD` invalidates every session estate-wide.** That is the emergency
lever. See [08-operations](./08-operations.md).

## Accounts

Four kinds of user row, all in the same table:

| | `password` | `verified` | Roles | Created by |
|---|---|---|---|---|
| Registered customer | set | usually true | none | `POST /api/auth/register` |
| **Shadow account** | `NULL` | false | none | Guest booking, or staff walk-in |
| Staff | set | true | one or more | `POST /api/users` (admin), then a reset email |
| Admin-created customer | `NULL` until reset | false | none | `POST /api/users` |

A shadow account is a full user with no password. When the same person later registers, uses forgot-
password, or (once the auth service lands) signs in with Google on the same address, they take
ownership of the existing row and their booking history comes with it. Nothing needs migrating.

Staff accounts are never given a password directly: `POST /api/users` sends a 24-hour password-reset
link instead.

## Roles

Three roles, in `user_roles`, unique on `(userId, role)`. No role at all is the customer case.

| Role | Intended holder |
|---|---|
| `ADMIN` | IT Manager, and normally the Theatre Manager |
| `MANAGER` | Box Office Manager, committee members who programme shows |
| `BOX_OFFICE` | Front-of-house volunteers on a shift |

The helpers are in `shared/utils/abilities/types.ts`:

```ts
export function hasRole(user: AbilityUser, role: string): boolean
export function isAdminOrManager(user: AbilityUser): boolean   // ADMIN | MANAGER
export function isStaff(user: AbilityUser): boolean            // + BOX_OFFICE
```

## The ability system

Permissions are declared as abilities in `shared/utils/abilities/{users,venues,shows,tickets,reservations}.ts`
and re-exported from `index.ts`. Because they live in `shared/`, the same rule runs on the server
(`authorize(event, ability)`) and on the client (middleware, conditional rendering).

**Two things to know before you add an endpoint:**

1. **A handler with no `authorize()` and no `requireUserSession()` is fully public.** There is no
   route-level middleware over `/api/**`. Forgetting the guard is not a subtle bug, it is an open
   endpoint — and it has already happened once, with `GET /api/shows` exposing DRAFT productions.

2. **`defineAbility(fn)` with a single argument sets `allowGuest: false`.** So an ability that
   *looks* public, like `readShow = defineAbility(() => true)`, actually denies anonymous users when
   passed through `authorize()` — it means "any logged-in user". Denial surfaces as **403**, not
   401. If you genuinely want a public endpoint, do not call `authorize()` at all.

## Permission matrix

| Area | ADMIN | MANAGER | BOX_OFFICE | Customer |
|---|---|---|---|---|
| Shows: create / update / publish | ✅ | ✅ | — | — |
| Shows: delete | ✅ | — | — | — |
| Performances: create / update / delete | ✅ | ✅ | — | — |
| Venues & features: create / update | ✅ | ✅ | — | — |
| Venues & features: delete | ✅ | — | — | — |
| Ticket types: create / update | ✅ | ✅ | — | — |
| Ticket types: delete | ✅ | — | — | — |
| Reservations: list / create / read / update | ✅ | ✅ | ✅ | own only |
| Reservations: delete | ✅ | ✅ | — | — |
| Users: list / read | ✅ | ✅ | ✅ | self |
| Users: create / update / delete | ✅ | ✅ | — | self |
| Users: assign roles | ✅ | — | — | — |
| Users: set `verified` | ✅ | — | — | — |
| Admin stats & CSV export | ✅ | ✅ | — | — |

Note the row that matters operationally: **`BOX_OFFICE` can list and read every user** — every name
and email the theatre holds. That is used by the walk-in lookup, which currently fetches the entire
user table into the volunteer's browser. See
[09-known-issues](./09-known-issues.md#walk-in-lookup-leaks-the-user-table).

## Client-side guards

`app/middleware/` — `auth`, `guest`, `admin`, `staff`. These are **user experience only**. They stop
someone landing on a page they cannot use; they are not a security boundary. The API is the boundary.

`/admin/*` uses `admin` (ADMIN or MANAGER). `/admin/box-office/*` uses `staff` (adds BOX_OFFICE).

## Password handling

- Hashing via `nuxt-auth-utils` (`hashPassword` / `verifyPassword`).
- Shared strength rule in `server/utils/validation.ts`: 8+ characters, upper, lower, digit. The
  account security page re-implements the same rule by hand instead of importing it — worth fixing
  when you next touch it.
- Reset and verification tokens are single-use rows in their own tables with expiry, deleted on use.
- Both `POST /api/auth/password/forgot` and `POST /api/auth/email/request` are enumeration-safe:
  they return the same response whether or not the address exists.

**There is no current-password challenge on password change.** `PUT /api/users/:id` accepts a new
password directly. The account page fakes verification by calling `POST /api/auth/login` first,
which as a side effect reissues the session. Anyone with a hijacked session — and any ADMIN or
MANAGER — can set a password with no challenge. Flagged in
[09-known-issues](./09-known-issues.md#no-current-password-challenge).

## Relationship to the central auth service

The `newtheatre/auth` service will take over identity for the whole estate: one account per person
across Proscenium, rooms, photos and anything that follows, with Google SSO for `newtheatre.org.uk`
Workspace accounts and email+password for audience members.

When it lands, this app keeps `users` as a **thin mirror** — `id`, `email`, `name` plus anything
app-specific — and drops local passwords, roles and the token tables. Local ids become the canonical
ids, so the mirror is an idempotent primary-key upsert. Guest checkout calls
`POST /api/users/shadow` on the service instead of inserting locally.

Two consequences for anything you build now:

- Do not add columns to `users` that describe the *person* rather than their relationship to this
  app. They will have to move.
- **Do the legacy ticketing import before the auth cutover**, or 9,505 users appear after the merge
  and you need a second one. See [ADR-0003](./decisions/0003-legacy-ticketing-import.md).
