# ADR-0047: An expected client error is logged as one line, not as a fatal

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

In the seven days to 2026-08-25 the Worker recorded 4,920 errors against 24,530 requests. Almost
every one was a vulnerability scanner asking for a file this app has never served: `/.env`,
`/.htpasswd`, `/wp-json`, `/rclone.conf`, `/firebase-service-account.json`, `/.git/config`. Each was
answered with a correct 404 and there was nothing to fix in the response. Each was also written to
the log at **fatal** level with a stack trace, so the error stream was almost entirely background
radiation and a genuine fatal error would have been one line in several thousand.

The way the 404 is thrown is right. `app/pages/[[slug]].vue` is the content catch-all, and
`createError({ statusCode: 404, fatal: true })` is what makes Nuxt render the theatre's error page
as a full page rather than an inline error state. `fatal` there is a rendering instruction.

Nitro reads the same flag as a logging instruction. Its default error handler computes
`isSensitive = error.unhandled || error.fatal`, and that single value decides both whether to mask
the response body and whether to `console.error` the error with its stack. One flag, two unrelated
meanings: a page that needs the first gets the second.

Replacing the error handler is not available to us. `nitro.errorHandler` is one slot, and
`@nuxt/nitro-server` claims it only when nothing else has (`if (!nitroConfig.errorHandler)`). That
handler is what renders `error.vue`, so setting our own would swap the theatre's 404 page for
Nitro's JSON, which is exactly the user-visible change this must not make.

## Decision

`server/plugins/error-logging.ts` hooks Nitro's `error` hook, which runs before the error handler
and sees the same error object.

1. **An expected client error (4xx, not `unhandled`) is logged as one line and nothing else**:
   status, method, path. The plugin clears `fatal` on it, and that is what stops Nitro logging the
   same error again with a stack.
2. **Everything else is left exactly as it was.** A 5xx, or anything unhandled, keeps Nitro's fatal
   log, its stack and its response masking. A change that silenced a real error would be worse than
   the noise it removed.
3. **A request carrying a same-origin referer is logged at `warn`**, naming where it came from,
   because that is a broken link on our own site and worth fixing. A probe, which carries no referer
   or an off-site one, is logged at `log`. Only the referer's **path** is logged: a same-origin
   referer carries the guest booking token in `?t=` ([ADR-0009](0009-signed-booking-access-tokens.md)),
   and so can the request's own query string, so neither is written to the log.

Nothing about the response changes. The status, the headers and the rendered error page are what
they were, because `fatal` has no part left to play by the time the error reaches the error handler.

## Alternatives considered

- **Drop `fatal: true` from the catch-all.** One character, and it regresses the page: a visitor who
  mistypes a URL gets an inline error state instead of the theatre's 404 page. The logging problem
  is not worth a worse 404.
- **Register our own `nitro.errorHandler`.** It takes the slot `@nuxt/nitro-server` needs, so
  `error.vue` stops rendering. An array of handlers would work but pins us to an internal path
  inside `@nuxt/nitro-server` that no contract keeps stable.
- **Answer the probes before the Worker sees them**, with a WAF rule or a redirect for the
  well-known paths. Worth doing on its own merits, and it cuts traffic rather than logging: whatever
  reaches the Worker still has to log readably. A separate decision, and a list somebody has to
  maintain.
- **Log nothing at all for a 404.** Cheapest, and it throws away the one 404 worth reading: the one
  a visitor reached by following a link we published.

## Consequences

- The error stream is genuine errors. A probe reads as `[404] GET /.env` in the log stream, and a
  broken internal link reads as `[404] GET /whats-on/old-show linked from /whats-on` at warn.
- **Every 4xx now logs one line**, including API refusals (401, 403, 409, 429) that logged nothing
  before. That is deliberate: one rule is easier to hold than two, and the level rather than the
  presence of a line is what separates these from a real error.
- Anything downstream of the `error` hook that wanted to know a 4xx was fatal cannot: the flag is
  cleared by then. Nothing does, and `fatal` is a client-rendering concern.
- The volume is one line per probe, which is the floor for a request we still answer. If that stops
  being worth it, the next lever is a WAF rule, not more filtering in the Worker.
- The plugin is the only place this rule lives. A handler that wants an expected refusal logged
  differently should not fight it; change the rule here.
