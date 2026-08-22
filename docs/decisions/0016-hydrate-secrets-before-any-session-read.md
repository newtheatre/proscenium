# ADR-0016: Hydrate Secrets Store values before any session read

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

Implements stage-door ADR-0016 (estate secrets in the Secrets Store) in this app.

## Context

`NUXT_SESSION_PASSWORD` is shared by every app on the estate, so it lives in the account Secrets
Store rather than as four worker secrets rotated in lockstep.

A Secrets Store binding is an object with an async `get()`, not a string. Nitro's env → runtimeConfig
mapping cannot consume one, and `nuxt-auth-utils` reads `runtimeConfig.session.password`
**synchronously** the first time a session is touched, and memoises the whole session config, the
password included, for the life of the isolate.

So the value must be written into `runtimeConfig` before any handler runs, and before any other
plugin reads a session. Three separate traps follow from that, all of which fail silently.

**Plugin ordering.** Nitro sorts `server/plugins/` with `localeCompare` on the filename and calls
their `request` hooks in that order. `authorization-resolver.ts` calls `getUserSession()` in its own
`request` hook. Registered as plain `secrets-store.ts` the hydration plugin sorted *after* it, so
every isolate memoised the empty default password and the app was permanently, silently logged out:
h3's `getSession` swallows unseal failures, so `/api/_auth/session` still answered 200 with an
anonymous `{ id }` and nothing appeared in the logs.

**The binding name.** On Workers `process.env` is a proxy over the bindings object, and Nitro's
`applyEnv` copies any `NUXT_*` key onto the matching runtimeConfig path. A binding named
`NUXT_SESSION_PASSWORD` would therefore land the *binding object* in `session.password`.

**A leftover worker secret wins.** `nuxt-auth-utils` resolves the password as
`defu({ password: process.env.NUXT_SESSION_PASSWORD }, runtimeConfig.session)`, and `defu` gives its
first argument priority, so a stale worker secret of that name beats the store. This app then seals
with the stale key while the auth service seals with the store key, and a user who logs in
successfully is bounced straight back to the login page. It cost an evening on 2026-08-14.

## Decision

- The hydration plugin is **`server/plugins/0.secrets-store.ts`**. The `0.` prefix is load-bearing:
  it is what guarantees this plugin's `request` hook runs before any other plugin reads a session.
  Do not rename it, and read its header before adding a plugin that touches the session.
- The **binding** is `SESSION_PASSWORD`, without the `NUXT_` prefix. The store-side secret keeps its
  `NUXT_` name; only the binding drops it. The same rule applies to anything else moved into the
  store.
- The plugin warns loudly when a worker secret of the same name is present, because the failure looks
  nothing like its cause.
- In development there is no binding and the plugin is a no-op; the password comes from
  `NUXT_SESSION_PASSWORD` in `.env`.

## Consequences

- Rotating the estate seal is one write in the Secrets Store and no deploy here. The auth service's
  runbook owns rotation.
- Scheduled tasks do not go through the request hook. None of ours seal sessions, so nothing is
  missing today, but a task that needs a store-backed secret must read the binding itself.
- `bookingTokenSecret` falls back to the session password when unset
  ([ADR-0009](0009-signed-booking-access-tokens.md)); that fallback resolves inside request handlers,
  so it sees the value this plugin has already written.
- `secrets_store_secrets` is valid wrangler config but missing from the wrangler types Nitro 2.13
  bundles, so `nuxt.config.ts` casts around it. Drop the cast once Nitro catches up.
