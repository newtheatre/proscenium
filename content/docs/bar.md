---
title: Bar
description: The till, the catalogue and the stock register.
module: Bar
updatedOn: 2026-09-14
updatedBy: Matt Adcock
---

## The till

`/tonight/till` opens without a bar shift for the bar manager, and with one for anyone else
(0044). A sale sends the basket's expected total, in pence, and a mismatch refuses quoting both
figures, the same discipline the box office desk uses. Tender is CARD or COMP; the theatre takes
no cash.

An age-restricted line may carry a Challenge 25 outcome; a tab holder may be charged instead of
the reader, capped by `BAR_TAB_CAP_PENCE` unless a manager overrides it.

### Tickets at the bar

The door never sells: an unpaid or walk-up customer is sent to the bar, and the till's Tickets
tab is where their money is taken (F-122, F-123). Scan the booking's QR with the camera, or type
the reference or a name; a pending booking adds what it owes to the basket beside the drinks, and
one charge takes the lot on one reader transaction. The booking is collected in the same write,
so the door reads PAID the moment it goes through. A collected, cancelled or expired booking says
so and offers nothing; changes to a booking stay on the desk.

A walk-up is sold from the same tab: tonight's performance here, a ticket type and a quantity. A
name and an email are optional and worth asking for, because with them the booking's QR is
emailed; without them the screen shows a door pass (the reference and the QR) to photograph, and
the counter laptop can print it. Ticket money never goes on a tab, and a discount never touches
a ticket line.

### Charging on SumUp

On a phone, when the SumUp hand-off is configured, the charge button opens the SumUp app with the
total already keyed (F-124). The app takes the payment on the reader as always and comes back to
the till; only then is the sale recorded. If the app does not come back, the till asks "did it go
through?": say it did (with the transaction code from the SumUp app if you have it), say it did
not, or check again. Any hand-off left waiting tonight is listed on the till so the laptop can
answer for it, and the till will not close while one is unanswered. "Taken on the reader, not
recorded" means the reader has money the ledger could not record, usually because the booking was
collected at the desk meanwhile: fix the cause and answer again, or refund on the reader and
abandon it with a note. The counter laptop keys the figure into the reader by hand, as before.

## The catalogue

`/bar/categories` and `/bar/products` are the standing configuration: categories, products and
their serving-size variants, gated on `bar.write`. Nothing here is operational.

## Stock

`/bar/stock` is the register: what is held, `/bar/stock/movements` its history and
`/bar/stock/order-list` a suggested reorder from what has sold. `/bar/stock/stocktakes` records a
count against what the register expects; a variance neither hides nor auto-corrects, it is
recorded and applied by a deliberate action.

## Reports

`/bar/reports` covers sales, gross profit, variance, comps and discounts over a night, a week, a
season or a custom range, queried fresh from the ledger and the movement history every time:
nothing here is a stored total that could drift from what actually happened.
