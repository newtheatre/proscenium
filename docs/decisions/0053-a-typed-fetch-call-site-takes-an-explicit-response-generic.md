# 0053: A typed-fetch call site takes an explicit response generic, never a route-map cast

- Status: Accepted
- Date: 2026-09-09
- Amended: 9 September 2026, see the section near the bottom before applying this record: the
  response generic alone does not short-circuit the recursion generally.

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

## Amended 9 September 2026: the response generic alone is not the fix

The Decision section above is wrong as a general claim, and this correction is load-bearing
enough to read before applying the record, not just as a historical footnote.

**What was wrong.** `password-policy.server.ts`, in exactly the form this record prescribes,
failed on show night's branch (#775) once its routes pushed the count past main's: `TS2322` and
`TS2589` together, naming the call's **method** position, not its response position:
`NitroFetchOptions<R, AvailableRouterMethod<R>> extends O ? "get" : ExtractedRouteMethod<R, O>`.
`Base$Fetch`'s call signature is `<T, R extends NitroFetchRequest, O extends NitroFetchOptions<R>
= NitroFetchOptions<R>>`; resolving `O`'s own default type, needed to type-check the call at all,
requires `AvailableRouterMethod<R>`, which calls `MatchedRoutes<R>` regardless of what `T` is.
Supplying a response generic short-circuits only `TypedInternalResponse`'s **response** position;
the **method** position resolves against the whole route map unconditionally, on every call,
whether or not the caller reads the result.

**Two hypotheses were tested directly and falsified, not assumed away.** Switching
`useRequestFetch()<T>(...)` to `$fetch<T>(...)` produces the identical error: both share
`Base$Fetch`'s signature, so which one is called does not matter. Reshaping the assignment,
tried four ways (a direct property assignment, a local `const`, a local typed `unknown`, and
routing the call through `useAsyncData`'s own callback), made no difference either: the
recursion happens while resolving the call expression's own type, before anything is done with
the result.

**What actually holds, verified end to end rather than per call site.** The first version of this
amendment said widening `R` to `string` was "confirmed against every call shape found in the
app", including calls carrying `{ method }` or `{ method, body }`. That was checked file by file
and read too much into a clean per-file result: run whole, on `origin/unified/show-night/E-121-E-122`
as it actually stood, `bun run typecheck` still failed with eleven errors once the widened form
was applied everywhere. **The two cases are genuinely different and the record now says so.**

*A call with no options* (`$fetch<T>(route)`, nothing else): widening `R` to `string` alongside
`T` holds. `$fetch<PasswordPolicy, string>('/api/auth/password-policy')` is merged and stable on
`main`. `app/layouts/tonight.vue`'s identical shape, `$fetch<unknown, string>('/api/tonight/emergency')`,
was independently re-verified the same way, against the real branch, exit code read rather than
assumed. **The instruction, usable directly: add `, string` as the second type argument.**

*A call carrying options* (`{ method }`, `{ method, body }`, `{ query }`): widening `R` alone
breaks it differently, `TS2345`, because `O`'s inference no longer has a narrow `R` to key off.
Supplying a third generic explicitly (`typeof` a locally-extracted options object) made every
individual failing line typecheck in isolation, but the same whole-branch run then failed
somewhere else entirely, `app/components/PersonPicker.vue`, a file neither this amendment's
change nor show night's own pull request touches. That is the same order-sensitive cost this
record's mechanism section already describes, now confirmed to survive a genuine fix attempt and
not only the original cast. **No generic form for an options-carrying call has been found that
holds end to end, and this record stops looking rather than trying a fourth shape**: Matt
authorised a documented suppression for exactly this reason. The verified answer: a targeted
`// @ts-expect-error` immediately above the failing line, with a one-line comment citing this
record, for example `// @ts-expect-error an options-carrying call has no working generic form yet (0053).`
Confirmed end to end: all eight option-carrying call sites on show night's branch suppressed this
way, `tonight.vue` given the working no-options form, `bun run typecheck` exits 0.

This is the remedy for bar's `#777` and box office's `D-124` too, the moment show night's routes
land on main: widen `R` for a plain call, suppress an options-carrying one. Do not re-derive
either, and do not trust a result that was not run whole against the real branch.

**`useRequestFetch()<T>(...)`, single generic, is not something show night introduced.** It is
the pre-existing pattern across dozens of call sites throughout the app (`TicketPrices.vue`,
`admin/index.vue`, `useAccount.ts`, and many more), and a full-repository check found upward of
sixty of them.

**Decided rather than deferred: no mechanical sweep, no per-stream conversion pass.** A call
site converts only once it actually fails, and the fix depends on its shape: `, string` for a
plain call, a suppression citing this record for one carrying options. Hitting `TS2589` or
`TS2345` in a file you did not touch is expected as the route map grows, not a regression to
investigate. `docs/known-issues.md` names the pattern so it is recognised on sight; it is not a
backlog inviting a wholesale conversion pull request, and one is not wanted.

**The trap this amendment exists to name explicitly:** *a green `typecheck` on any one branch, or
on a handful of edited files rather than the whole branch, proves nothing about the pattern's
safety in general.* A per-file check that looks clean can still fail once run whole, exactly as
the options-carrying attempt above did. Re-run `bun run typecheck` end to end, on the real branch,
reading its exit status, after any rebase that adds routes or any fix to this pattern; do not
trust a narrower check that predates it or stands in for it.
