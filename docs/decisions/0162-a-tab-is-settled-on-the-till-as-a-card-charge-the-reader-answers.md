# 0162: A tab is settled on the till as a card charge the reader answers

- Status: Proposed
- Date: 2026-10-21
- Builds on: 0096. Nothing in it is superseded.

## Context

F-109 built `POST /api/till/tab-settlements`, bounded to the charges it names and cross-checked
against what they total. No screen ever called it: the till offered no way to pick a holder or
see what they owed, while the holder's own page and the operator docs said the till "takes
payment against them". The bar review of 21 October 2026 found it (T6).

The route also wrote first. It posted the settlement the moment it was called, with tender CARD,
which is the order 0096 removed from every other charge on the till: a declined card would have
left the tab marked paid with nothing taken.

## Decision

Settling a tab is a typed card charge like any other (0096).

- **Settle a tab** sits beside Close till while the basket is empty. It lists everyone with an
  outstanding charge, authorised now or not, from a new read, `GET /api/till/tab-settlements/holders`.
  Picking one lists their charges and the total.
- `POST /api/till/tab-settlements` runs the same cross-check as before and then starts a `TYPED`
  attempt holding the holder and the charge ids, not a basket. Nothing is written to the ledger.
- The till shows the figure to key, and **Reader took it** or **Card declined** answers it through
  the same resolve route as a sale. Reader took it runs the cross-check again and posts the
  settlement, marking the attempt succeeded in the same batch. A refusal then (a charge voided or
  settled meanwhile) is a mismatch for a person, exactly as a basket's is.
- One holder's tab is on the reader once at a time: a second start is refused while an earlier
  settlement for them is waiting or was taken and not recorded.
- A settlement of nought takes nothing from the reader, so it is written at once.

On the same screen, `/bar/tabs` no longer offers Void on your own tab, and says who voids it.

## Consequences

- A tab cannot be marked paid without the reader having answered, and the close is refused while
  a settlement waits, as for a sale.
- The attempt row's `basket` holds `{ settlement }` instead of `{ sale }`. Its listing reads
  "Settling <name>'s tab", looked up from the holder's row so an erased holder is not kept.
- A settlement has no SumUp hand-off. A phone with the app keys it into the reader by hand.
- A settlement recorded late by the Treasurer posts on its own night's session with no late-sale
  audit row, since it has no basket to replay.
- Anything that called the old route and expected the settlement to land now gets an attempt id
  back and must answer it.

## Options considered

- **Keep write-first and call it after the reader.** Rejected: a refusal after the card is taken
  would leave money on the reader and no record of it, which is the gap attempts close.
- **Correct the docs and leave settlement unbuilt.** Rejected: tabs would grow without limit, and
  the Treasurer would have no way to clear them.
