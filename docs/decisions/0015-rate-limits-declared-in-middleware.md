# ADR-0015: Rate limits are declared centrally, in middleware, backed by D1

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`server/utils/rateLimit.ts` was written, tested, and never called from anywhere. The limiter
existed, the limits did not, and its own comments read as though protection were in place. Nothing
distinguishes that state from a working one except reading every call site.

The store is constrained: the KV namespace is disabled and there are no Durable Objects, so D1 is the
only shared state available.

## Decision

**Limits are declared in one table in `server/middleware/rateLimit.ts`, against route patterns.**

A new public route is covered by adding a line to that table, rather than by remembering to call the
limiter from the handler. Handler-level limiting remains available for cases the route pattern cannot
express.

**Buckets are per-IP via `CF-Connecting-IP`.** That header is set by the edge and cannot be spoofed
by a client on a Cloudflare-fronted origin, unlike `X-Forwarded-For`. Its **absence** means the
request did not come from outside (an SSR render calling the app's own API, or local dev) and such
requests are skipped rather than falling back to a shared bucket, which a busy evening's page renders
would exhaust before rejecting real customers.

**Limits are deliberately generous.** Student halls and the theatre's own wifi put many genuine
customers behind one address, so these are sized to stop a script, not to police a busy on-sale.

**A fixed window, not a sliding one.** The counter is a single upsert with `RETURNING`, which SQLite
executes atomically, so two simultaneous requests cannot both read the same count and each write back
one more. A fixed window can let through up to twice the limit across a boundary. That is the wrong
trade for billing and the right one here: the aim is to stop thousands of attempts, and the cost of
being approximate is that an attacker gets ten tries instead of five.

`key` encodes both the action and the subject: `login:ip:1.2.3.4`,
`forgot:email:someone@example.com`, so one table serves every limit.

### Guest checkout is limited by address, not only by IP

`POST /api/bookings` sends a confirmation to whatever address the caller supplies, carrying their
name and notes, from the theatre's own domain. The generous per-IP limit is the wrong instrument for
that; a narrower per-address bucket inside the handler bounds how often one *address* can be mailed.
A real person booking several performances in an evening stays well inside it.

## Consequences

- Coverage is auditable by reading one table.
- Limits are approximate by design. Do not tighten them into a sliding window without a reason that
  outweighs the added complexity.
- The D1 table accumulates rows; a scheduled task sweeps lapsed windows.
