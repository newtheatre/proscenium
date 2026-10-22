# 0164: A tab is charged only with its holder there

- Status: Proposed
- Date: 2026-10-22
- Amends: F-108 (adds criterion 6)

## Context

Process-map finding: the till offered every authorised holder's tab to whoever was serving, and
nothing showed the holder was at the bar. Anybody on a till could put a round on a committee
member's tab while they were at home, and the first anyone knew was the balance on My NNT.

## Decision

**Somebody else's tab needs its holder's code for tonight.** My NNT's Bar tab page shows an
authorised holder a code, as a QR code and as eight characters (`XXXX-XXXX`, Crockford's
alphabet so O and 0, I, L and 1 read alike). The till asks for it whenever the chosen holder is not
the person signed in, by camera or by typing, and sends it with the sale as `tabCode`.

- The code is the booking QR's HMAC (`qrTokenFor`, D-108) over `tab:<holder id>:<show night>`,
  cut to forty bits. Nothing is stored: the server recomputes it on each charge, so it needs no
  table, no expiry sweep and no migration.
- It is scoped to the show night (0014), so it changes at 04:00 and a code seen once cannot be
  reused next week.
- `/api/till/sale` checks it after authority and before anything is written, and refuses with 403,
  naming the holder in `data.tabCodeFor` so the till reopens its code sheet rather than showing a
  bare error.
- Your own tab needs no code: being signed in at the till is already the holder being there.
- Only an authorised holder has a code; somebody still owing after their authority lapsed sees
  their tab but no code, since nothing can be charged to it.

## Consequences

- A holder must have their phone (or have read the code out) for somebody else to charge them.
  The till's fallback is the reader.
- Forty bits refused at the endpoint is far beyond guessing in a night; the code is a presence
  check, not a password, and does not unlock anything else.
- Rotating the QR secret changes every code at once, which is harmless: codes live a night.
