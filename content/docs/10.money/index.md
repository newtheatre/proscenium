---
title: Money
description: The money dashboard, the reports built on the ledger, daily reconciliation, period close and the SU export.
module: Finance
audience: committee
updatedOn: 2026-09-23
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-banknote
---

Every pound the theatre takes is written to one ledger at the moment it moves: a ticket
collected at the desk, a drink sold at the till, a pass issued, a refund handed back. Nothing on
these screens is typed in twice. The Money group at **Manage, Money** is the Treasurer's view over
that ledger: what came in, what was given away, whether the card reader agrees, and what goes to
the Students' Union at the end of a period.

## If something goes wrong

- **"The dashboard could not be read."**: the ledger query failed or you no longer hold a
  finance permission. Change the period and back to read it again; if it persists, check your
  role under [roles and the committee year](/docs/people/roles).
- **The Entries buttons are missing**: you are on the Committee rather than the Treasurer. The
  committee sees the totals, not the entries behind them.

## Who reaches what

- **The Treasurer** opens every screen in the group and every figure down to one ledger entry,
  records a reader reading, closes a period, changes an SU nominal code and takes the SU export.
- **The Committee** opens the money dashboard only, with its totals but without the **Entries**
  buttons that drill into who rang what in.
- **The IT Manager** reopens a closed period, which nobody else does, and holds everything the
  Treasurer holds.

::callout{icon="i-lucide-info" color="info"}
**Nothing here moves money.** All payment is taken in person on the SU's physical SumUp reader,
and what the reader took is recorded here. There is no online charge, no card data and no
settlement feed to match against, so reconciliation is a person reading the reader's Z total
and typing it in.
::

## The money dashboard

The dashboard at `/money` is the first item in the group. It answers "how are we doing" for one
period: a day, a week, a month, a term, a season or a year. The year runs from {{ YEAR_START }}
to {{ YEAR_END }} (month and day, London), the same year the committee's roles run to. A season
is one of the theatre's seasons, Autumn, Spring, StuFF or the Fringe, and runs on the days the
Box Office Manager gave it on the [seasons](/docs/box-office/seasons) screen.

![The money dashboard with the period kind (1), the period's own controls (2), revenue by source (3) and the other figures (4)](/images/docs/money/dashboard.png)

1. **Period kind**: DAY, WEEK, MONTH, TERM, SEASON or YEAR. A day or a week takes a date; a
   month takes a month and a calendar year; a term, a season and a year are each chosen from a
   list of themselves.
2. **Month** and **Calendar year** are each a list, and a **Year** reads as the two calendar
   years it spans, "2025/26". A term has no rule behind it: its range is whatever was typed when
   the term was defined on the [periods](/docs/money/periods) screen, so TERM appears only once
   at least one term exists. A **Season** is listed by name, newest first, retired ones included,
   and SEASON appears only once at least one season exists.
   Changing any of these reads the ledger again at once; there is nothing else to press. Every
   figure is a query, so a sale made a moment ago is already in the next read.
3. **Revenue by source**: what each surface took on a card, Desk, Till and so on. With
   the Treasurer, each row has an **Entries** button that opens the
   [ledger entries](/docs/money/ledger-entries) list filtered to that source and the
   dashboard's range.
4. **Refunds**, **Forgone comps**, **Forgone discounts** and **Open variance**: the money
   handed back, the value given away rather than taken, and the sum of every night's reader
   reading that still disagrees with the ledger and has not been written off.

The range the figures cover is printed above them, from and to, as London dates.

## The pages

::card-group
  ::card{icon="i-lucide-drama" title="Revenue by show" to="/docs/money/revenue-by-show"}
  What each show actually took: collected, unrefunded ticket money, with walk-ups and pre-booked
  told apart, and pass utilisation beside it.
  ::
  ::card{icon="i-lucide-gift" title="Comps and discounts" to="/docs/money/comps-and-discounts"}
  Forgone value by show or by period, and access and companion admissions as counts only.
  ::
  ::card{icon="i-lucide-scale" title="Daily reconciliation" to="/docs/money/daily-reconciliation"}
  The figure the reader's Z should read for a night, recording what it did read, and resolving
  the difference.
  ::
  ::card{icon="i-lucide-receipt" title="Ledger entries" to="/docs/money/ledger-entries"}
  What an entry and a line are, why nothing is ever edited, and how to find one.
  ::
  ::card{icon="i-lucide-lock" title="Periods" to="/docs/money/periods"}
  Closing a range so its figures stop moving, and reopening it when the IT Manager must.
  ::
  ::card{icon="i-lucide-file-down" title="Exports" to="/docs/money/exports"}
  The CSV shaped for the SU's accounting, and the nominal codes each ledger line maps to.
  ::
::

## Related pages

- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Desk](/docs/box-office/desk)
- [Till](/docs/tonight/till)
- [Bar reports](/docs/bar/reports)
