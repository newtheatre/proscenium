# ADR-0008: Roles go stale; identity does not

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Since the stage-door cutover this app does not own identity. The sealed `nnt-session` cookie is
read-only here, and the estate staleness rule says a session older than 15 minutes: measured from
when the auth service last re-read the database: must not have its **roles** honoured. Sessions last
30 days, so *most* of a staff session's life is spent stale by that definition.

Two attempts at enforcing this were wrong in opposite directions.

**Throwing a 401 for any stale role-holding session.** A staff member could not see their own
bookings on `/account/reservations` after fifteen minutes: an identity-only query refused because a
role list nobody had consulted might be out of date.

**Throwing anything at all from the server user resolver.** `nuxt-authorization`'s `authorize()`
wraps `resolveServerUser()` in a try/catch that re-throws only `AuthorizationError`; every other
error is swallowed and `authorize()` then resolves **successfully**, running the handler with no
authorization check. A resolver that threw on stale sessions therefore turned the staleness rule into
a privilege escalation, and the ordinary state of a staff session granted every ability in the app.

## Decision

**Staleness is expressed as data, not as an exception. `sessionUserForAuthorization()` must never
throw.**

A stale session keeps its identity and loses its `proscenium:` roles. Who someone is does not go
stale: the cookie is sealed and unexpired, so `user.id` is as trustworthy at 20 minutes as at 20
seconds. It is the role list that may have been revoked centrally since.

Consequently:

- Staff abilities fail closed on a stale session.
- Ownership checks (`readReservation`'s `user.id === resource.userId`) keep working.
- Role-less users have nothing stale to honour, so ordinary audience browsing never round-trips
  anywhere. Only staff sessions are bounced through `auth.newtheatre.org.uk/api/session/refresh`,
  which re-reads roles and rejects revoked or disabled accounts. The session-epoch check lives there,
  not here.
- Any failure to resolve a session (an unreadable or tampered cookie, anything unexpected) returns
  `null`, which denies. Throwing would grant.

## Consequences

- The resolver's contract is load-bearing and non-obvious. It is restated at the function itself
  because a future refactor that "improves error handling" by throwing would silently disable
  authorization app-wide.
- Client middleware refreshes the browser independently, so the staleness rule is invisible in normal
  use.
- This app cannot see the session epoch, which has a second consequence for erased accounts: see
  [ADR-0014](0014-anonymise-never-delete.md).
