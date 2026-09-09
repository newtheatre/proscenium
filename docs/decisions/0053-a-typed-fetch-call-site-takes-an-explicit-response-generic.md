# 0053: A typed-fetch call site takes an explicit response generic, never a route-map cast

- Status: Accepted
- Date: 2026-09-09

## Context

An untyped `$fetch(route, ...)`, `useFetch(route, ...)` or `useRequestFetch()(route, ...)` call
asks Nitro to infer the response type from the route itself. Bar's `app/plugins/password-policy.server.ts`
was the first to fail this with `TS2589: Type instantiation is excessively deep and possibly
infinite` (#776), on a file its own change never touched. Show night's E-121/E-122 then tipped
many more files over the same edge and, under pressure, reached for `$fetch as unknown as (...)`
at each one: a cast that compiles, but discards route-literal checking and response-type checking
together, at every site it touches.

The actual mechanism, read from `nitropack`'s own generated types rather than guessed: an
untyped call resolves `TypedInternalResponse<Route, unknown, Method>`, which (since `unknown`
does not extend `string | boolean | number | null | void | object`) falls through to
`MiddlewareOf<Route, Method>`, which calls `MatchedRoutes<Route>`. `MatchedRoutes` matches
`Route` against **every** key of `InternalApi`, the whole app's route map, using `CalcMatchScore`,
a recursive template-literal type run once per route to support pattern matching (`/api/foo/:id`
against a literal path). With close to 300 server routes, this recursion is what trips
TypeScript's instantiation depth limit, and it does so at *any* untyped call site in the app, not
only in a file near the routes that pushed the count over the edge. This is why the failure reads
as an unrelated regression: it is a route-count threshold, not a defect in the file it names.

Two other explanations were checked and ruled out rather than assumed. The `tsconfig` project
layout is not the cause: `InternalApi` must be visible to app code by design, for typed fetch to
work at all, and splitting projects would not change `CalcMatchScore`'s cost, which is driven by
the total route count rather than which project the caller compiles under. No Nuxt or Nitro
config option disables this either; `nitro.typescript.internalPaths` was the only plausible
candidate and only affects path aliases for Nitro's own runtime imports, unrelated to route
response inference. TypeScript itself has no compiler flag to raise the instantiation depth
limit.

## Decision

**Every `$fetch`, `useFetch`, `useLazyFetch` and `useRequestFetch()` call against an internal
route takes an explicit response-type generic**, for example
`$fetch<PasswordPolicy>('/api/auth/password-policy')`, never a cast such as
`$fetch as unknown as (...)`. Supplying the generic makes `Default extends ... object` true
immediately, so `TypedInternalResponse` returns it without ever calling `MatchedRoutes`, avoiding
the expensive recursion entirely. Critically, the route argument itself is still checked against
`NitroFetchRequest`, so a typo'd or renamed route still fails to typecheck; only the response
shape is now asserted by the caller rather than inferred.

This is a deliberate, permanent trade of type safety for compile time, across the whole app: the
response type is no longer verified against the handler that actually produces it, so a handler's
return shape changing silently stops being caught at its call sites. There is no route-count
threshold below which this stops being necessary, since it will recur as the route map keeps
growing; the convention applies everywhere a typed fetch call is written, not only where TS2589
has already fired.

`eslint.config.mjs` refuses the specific cast shape (`X as unknown as` a function type) that
motivated this record, as an automated backstop: it does not verify every call carries a correct
generic, since a legitimate untyped call exists (one whose result is discarded, or an external
URL `NitroFetchRequest` cannot resolve against `InternalApi` regardless), but it stops the blunt
workaround from being written again.

## Consequences

- `tab_settled_at`-style silent drift cannot happen here the way it did in 0052: a wrong generic
  is a lie the next reader has to notice by eye, same as any other manually-asserted type, not a
  runtime defect. The cost is accepted because the alternative, `as unknown as`, is strictly
  worse: it discards the route check too, and is what was already spreading.
- The known-issues row from #776 is removed rather than left beside this record: the ad hoc
  per-call fix it described is now the estate's standing convention, not an open gap.
- A future Nitro release that resolves the underlying recursion more cheaply would make this
  record's mechanism section stale, not its decision: the explicit-generic convention is worth
  keeping regardless, since it is the correct type for a caller to assert regardless of why
  inference might fail.

## Options considered

- **A stricter lint rule requiring a generic on every typed-fetch call.** Rejected: `NitroFetchRequest`
  also accepts an arbitrary external URL, which a lint rule cannot distinguish from an internal
  route without type information, so this would either need a full type-aware rule or accept a
  meaningful false-positive rate. The narrower rule, banning only the cast shape actually seen,
  has no such trade-off.
- **Splitting `app`'s tsconfig project from `server`'s to shrink what a component resolves.**
  Rejected on the evidence above: the route map's visibility to app code is the feature, not an
  accident of project layout, and the recursion cost travels with the route count regardless.
