# ADR-0038: No ability may throw, and a missing resource denies

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[ADR-0008](0008-roles-go-stale-identity-does-not.md) established that `sessionUserForAuthorization()`
must never throw, because `nuxt-authorization`'s server bouncer wraps `authorize()` in a try/catch
that re-throws only `AuthorizationError`. Anything else is swallowed, `authorize()` resolves, and the
handler runs with no authorization check at all.

That rule was written about the resolver. The same trap sits one layer further in, in the abilities
themselves, and it fired: `GET /api/users/:id/summary` called `authorize(event, readUser)` with no
resource. `readUser` short-circuits for staff, so staff callers passed; every other signed-in caller
reached `user.id === resource.id` with `resource` undefined, threw a `TypeError`, and was **granted**.
Any signed-in customer could read any user id's name, email address, booking history with amounts,
passes and shift history.

The arity error is not caught by CI. `authorize` is typed `...args: BouncerArgs<Ability>`, which
should make the resource argument required, but `nuxt run typecheck` passes on the omission.

## Decision

**Every ability is total: it returns a boolean for any argument it can be called with, including a
missing resource, and a missing resource denies.**

- A resource-taking ability starts `if (!resource) return false`.
- The parameter stays declared as required, so a new call site that omits it is still wrong; the
  guard is what makes it wrong *safely* rather than wrong *permissively*.
- Passing the resource after the 404, as `readUser` does in `index.get.ts`, stays the house pattern:
  existence then reads the same to an unauthorised caller as to anyone else.

## Alternatives considered

**Type the resource as optional.** Denies safely at runtime, but makes an omitting call site legal
TypeScript, so the next one is not even a mistake.

**Rely on typecheck to catch the arity.** It does not, on this version of the library, and the failure
mode when it does not is a silent grant.

## Consequences

- The ability layer is the only thing between a session and this data, so the deny-on-undefined guard
  is load-bearing, not defensive tidying.
- ADR-0008's rule is unchanged and now has its general form: nothing reached from `authorize()` may
  throw, resolver or ability.
- A reviewer checking a new route should read the `authorize(...)` line for its resource argument the
  same way they read a query for its column allow-list.
