# ADR-0040: Refuse a request rather than serve one with no session key

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[ADR-0016](0016-hydrate-secrets-before-any-session-read.md) established that `0.secrets-store.ts`
must hydrate the session password before any plugin reads a session, because `nuxt-auth-utils`
builds its session config **once** into a module-scoped variable and defu-copies
`runtimeConfig.session` at that moment. Whatever the password is on that first read is the password
for the life of the isolate.

ADR-0016 covered the ordering. It did not cover the failed read. `secret.get()` rejecting on the first
request an isolate handles, a Secrets Store blip, left the catch logging and returning normally with
`runtimeConfig.session.password` still `''`. The very next request hook,
`authorization-resolver.ts`, called `getUserSession()`, and the empty password was pinned. h3's
`getSession` swallows the unseal failure and Nitro swallows the hook rejection, so nothing surfaced.

The result for the rest of that isolate's life: every session reads as signed out. Customers are
signed out mid-checkout, `sessionUserForAuthorization()` returns null so every `authorize()` denies,
and staff lose the box office and the show-night screen. A later request whose read succeeds cannot
repair it, because the memo has already been taken. `/api/health` kept answering 200.

A `throw` from the Nitro `request` hook is not, on its own, a fix. Nitro catches every request-hook
rejection and continues to the handler, so the customer would get a 200 with no session and the first
handler to touch the session would prime the same memo with `''`.

## Decision

**A request that cannot be served with a real session key is refused, and the refusal is visible.**

1. `0.secrets-store.ts` retries `secret.get()` a bounded number of times, because surviving a blip is
   the actual goal.
2. On a definitive failure it rethrows. That does not become the response, but hookable calls request
   hooks serially through `.then`, so the rejection skips the rest and `authorization-resolver.ts`
   never reads a session.
3. `server/middleware/0.session-key.ts` is the hard stop. Middleware are stack handlers, so a
   `createError({ statusCode: 503 })` there goes through h3's `onError` and becomes a real response.
   Nothing downstream runs, so nothing primes the memo.
4. The middleware gates on `useRuntimeConfig(event).session.password` being empty, not on
   `process.env.NUXT_SESSION_PASSWORD`. On Workers `process.env` is a proxy over bindings, and in
   development the value arrives in `runtimeConfig` through Nitro's `applyEnv`. Testing
   `runtimeConfig` keeps development a genuine no-op and still fails closed in production.
5. `/api/health` is exempt from the middleware and reports `sessionKey` itself, so monitoring gets a
   503 naming the cause instead of a generic one.

## Alternatives considered

**Let the request through and hope a later one succeeds.** This is the behaviour being fixed. No
later request can succeed, because the memo is taken on the first.

**Clear the memo inside `nuxt-auth-utils`.** It is module-scoped in a dependency with no seam for it.
Patching a dependency to work around our own ordering is worse than refusing the request.

**503 from the plugin's `request` hook.** Nitro catches it and serves the handler anyway, so the
customer gets a 200 with no session: the same hole with a log line.

## Consequences

- A Secrets Store outage becomes a short, loud 503 rather than a silent estate-wide sign-out lasting
  as long as the isolate. That is the right trade on a show night: nobody is quietly served a page
  that has forgotten who they are.
- Development with no `NUXT_SESSION_PASSWORD` now 503s instead of behaving oddly. The middleware logs
  the reason once per isolate, and `bootstrap.sh` sets the value, so this should only be seen by
  someone who has edited their `.env`.
- The health check is the estate's answer to a silent failure, as it was for migrations
  (stage-door ADR-0021). Anything that can take the app out quietly belongs in it.
