# ADR-0009: Guest booking access uses a signed token, not the booking reference

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`bookingRef` was doing two incompatible jobs: the reference a customer quotes at the box office, and
the bearer secret that unlocked their booking via `?ref=`.

As a secret it is weak. Six characters from a 32-symbol alphabet is about 1.07 × 10⁹ values; against
28,879 live rows a blind guess hits a real booking roughly once in 37,000. The payload behind it is a
name, an email address and free-text notes.

As a reference it is deliberately public. It is printed on confirmation emails, read aloud at the box
office and quoted in messages — so treating it as a credential meant every one of those places was
handing out access to the booking it identified.

Putting a credential in the query string is its own problem: it reaches browser history, any
intermediary's logs, and the `Referer` header of every outbound link on the booking page.

## Decision

**Separate the two jobs.** The reference goes back to being a reference. Access is granted by a
signed, scoped, expiring token.

Format: `<base64url payload>.<base64url HMAC-SHA256>`, implemented in `server/utils/bookingToken.ts`.

- HMAC rather than encryption: nothing in the payload is secret — the booking id is already in the
  path. What is needed is authenticity, not confidentiality.
- Compact enough for a URL, verifiable without a database round trip, and revocable in bulk by
  rotating the secret.
- Scoped to one booking and expiring on its own.

`?ref=` is no longer accepted as a credential anywhere.

The token arrives in a link's query string, and `server/utils/bookingAccess.ts` moves it into a
cookie on first use so the page can drop it from the address bar. The token was already scoped and
expiring; the cookie is simply a better place to keep it.

`NUXT_BOOKING_TOKEN_SECRET` signs these. It falls back to `NUXT_SESSION_PASSWORD` when unset, which
works but is undesirable in production: rotating the estate seal — the emergency estate-wide logout
lever — would then also invalidate every booking link already sitting in customers' inboxes, and any
other estate app holding the seal could mint booking tokens.

## Consequences

- A booking reference quoted in public no longer grants access to the booking.
- Guest booking links expire. A customer who needs access after that books again or asks the box
  office, which is the same answer as for a lost reference.
- Revocation is all-or-nothing via secret rotation. There is no per-token revocation list, and none
  is warranted at this volume.
