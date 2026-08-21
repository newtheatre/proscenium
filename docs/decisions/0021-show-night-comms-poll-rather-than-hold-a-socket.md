# ADR-0021: Show-night comms poll; they do not hold a socket

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The backstage board and the front-of-house side of it exchange messages during a performance
([11-show-night-screen-design §2.4](../11-show-night-screen-design.md)). The comp approval queue
([13-bar-design §4.1.2](../13-bar-design.md)) needs the same transport. Both want a message that
appeared on one device to show up on another within a few seconds.

On Cloudflare Workers, WebSockets are not a library choice. A socket means a Durable Object to hold
it: a second stateful runtime beside D1, with its own lifecycle, its own migrations, its own failure
modes and its own bill. [02-architecture](../02-architecture.md) currently describes one stateful
thing, and that is D1.

The traffic this has to carry is a handful of messages per performance, between two to four devices,
for about three hours a night.

## Decision

**Short polling against a plain D1-backed endpoint.** A couple of seconds between requests, a cursor
so that a poll finding nothing is cheap, and no new infrastructure.

One mechanism, three consumers: the backstage board, the FOH side of it, and the comp approval
queue.

**The upgrade path is a Durable Object per performance.** The conditions that would justify taking
it are worth recording, so the judgement can be remade rather than re-argued:

- Latency actually grates on a show night, reported by someone who worked one rather than predicted
  in advance.
- Message volume grows past what a preset board implies, which would first mean asking whether the
  board has quietly become a chat app, contrary to §2.4's own scope note.
- Polling cost becomes visible on the bill, which at this volume it will not.

## Alternatives considered

- **A Durable Object per performance from the start.** The right answer at ten times this volume, and
  an over-commitment at this one: a stateful runtime added to the architecture for a feature whose
  entire payload is "house open".
- **Server-sent events.** Still a held connection on a Worker, with most of the same commitment and
  worse behaviour on flaky foyer wifi.
- **Nothing: use the society group chat.** The honest baseline. It loses acknowledgements, which are
  the only reason this feature justifies itself over a group chat in the first place.

## Consequences

- A message can be up to one poll interval stale. Fine for "standby" and "house open"; not fine for
  anything where seconds matter, so **nothing safety-critical goes on this channel**. The emergency
  content is static and separate for exactly that reason
  ([11-show-night-screen-design §2.5](../11-show-night-screen-design.md)).
- The board must show a **stale banner** when polls stop succeeding for around thirty seconds. A
  comms board that is silently frozen is worse than no board, and polling makes that state both easy
  to detect and easy to render.
- Poll endpoints are ordinary API routes and carry ordinary rate limits
  ([ADR-0015](0015-rate-limits-declared-in-middleware.md)). Set them with the poll interval in mind,
  or the transport rate-limits its own users.
