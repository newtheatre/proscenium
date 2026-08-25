# ADR-0048: An absent SESSION_PASSWORD binding is not a failed read

**Status:** Accepted · **Date:** 2026-08-26 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`server/middleware/0.session-key.ts` refuses every request when no session password
is present, because serving one would seal the isolate to an empty key
(ADR-0040). Its log line offers two explanations: the Secrets Store read failed,
or the variable is unset in development.

Production says neither is what happened. Over the seven days to 2026-08-25 the
middleware refused requests on **70 isolates** (its warning is once per isolate,
so the refused-request count is higher, and each of those isolates refused
everything it served). Over the same window `server/plugins/0.secrets-store.ts`
logged its read-failure line **zero times**.

The read never failed. `secret.get()` was never reached: the plugin's first
line is

```ts
const secret = env?.SESSION_PASSWORD
if (!secret) return
```

and it returned silently. So on those isolates the binding itself was not
visible, and nothing recorded that. The middleware then reported a failed read,
which is the one thing that had not happened.

## Decision

The two cases are logged separately, and the absent-binding case says what it
could see: whether the Cloudflare context was present at all, and how many keys
the environment carried.

This deliberately does **not** attempt a fix. The cause is not yet known, and
the candidates need different remedies: a request arriving without the
Cloudflare context populated, a version deployed before the binding existed
still taking traffic during a gradual rollout, or something else. Choosing one
now would mean building for a cause nobody has confirmed.

## Consequences

- The next occurrence names itself, and the log distinguishes "no binding" from
  "the store refused" from "unset in development".
- The middleware's message is corrected to stop asserting a cause it cannot
  know.
- **This is a diagnostic step, and the issue stays open until the log says
  what is happening.** The measure of success is a `[secrets-store] no
  SESSION_PASSWORD binding` line appearing with its context, not the refusals
  stopping.
- The fail-closed behaviour is unchanged and stays. Refusing is the right
  answer to not knowing the key; ADR-0033 and ADR-0040 both still hold.
