---
title: Money
description: The season dashboard, the reports built on the ledger, daily reconciliation, period close and the SU export.
module: Finance
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-banknote
---

Every pound the theatre takes is written to one ledger at the moment it moves: a ticket
collected at the desk, a drink sold at the till, a pass issued, a refund handed back. Nothing on
these screens is typed in twice. The Money group at **Manage, Money** is the treasurer's view over
that ledger: what came in, what was given away, whether the card reader agrees, and what goes to
the Students' Union at the end of a period.

## Who reaches what

- **`finance.read`**, held by the Treasurer role, opens every screen in the group and every
  figure down to the individual ledger entry.
- **`finance.write`**, also the Treasurer's, records a reader reading, closes a period and
  changes an SU nominal code.
- **`finance.export`**, the Treasurer's third permission, downloads the SU export.
- **`finance.summary`**, held by the Committee role, opens the season dashboard only, with its
  totals but without the **Entries** buttons that drill into who rang what in.
- **`finance.reopen`** reopens a closed period. No role holds it except an administrator, who
  holds every permission.

::callout{icon="i-lucide-info" color="info"}
**Nothing here moves money.** All payment is taken in person on the SU's physical SumUp reader,
and the system records what the reader took. There is no online charge, no card data and no
settlement feed to match against, so reconciliation is a person reading the reader's Z total
and typing it in.
::

## The season dashboard

The dashboard at `/money` is the first item in the group. It answers "how are we doing" for one
period: a day, a week, a month, a term or a season. The season runs from {{ SEASON_START }} to
{{ SEASON_END }} (month and day, London), the same year the committee's roles run to.

![The season dashboard with the period kind (1), the year (2), Refresh (3), revenue by source (4) and the other figures (5)](/images/docs/money/dashboard.png)

1. **Period kind**: DAY, WEEK, MONTH, TERM or SEASON. A day or a week takes a date; a month takes
   a month number and a year; a season takes the year it starts in.
2. **Year**, and for a month the **month number**. For a term, a second list of the terms
   themselves. A term has no rule behind it: its range is whatever was typed when the term was
   defined on the [periods](/docs/money/periods) screen, so TERM appears only once at least one
   term exists.
3. **Refresh** reads the ledger again. Every figure is a query, so a sale made a moment ago is
   already in the next read.
4. **Revenue by source**: what each surface took on a card, Desk, Till and so on. With
   `finance.read` each row has an **Entries** button that opens the [ledger entries](/docs/money/ledger-entries)
   list filtered to that source and the dashboard's range.
5. **Refunds**, **Foregone comps**, **Foregone discounts** and **Open variance**: the money
   handed back, the value given away rather than taken, and the sum of every night's reader
   reading that still disagrees with the ledger and has not been written off.

The range the figures cover is printed above the tables, from and to, as London dates.

## The pages

::card-group
  ::card{icon="i-lucide-drama" title="Revenue by show" to="/docs/money/revenue-by-show"}
  What each show actually took: collected, unrefunded ticket money, with walk-ups and pre-booked
  told apart, and pass utilisation beside it.
  ::
  ::card{icon="i-lucide-gift" title="Comps and discounts" to="/docs/money/comps-and-discounts"}
  Foregone value by show or by period, and access and companion admissions as counts only.
  ::
  ::card{icon="i-lucide-scale" title="Daily reconciliation" to="/docs/money/reconciliation"}
  The figure the reader's Z should read for a night, recording what it did read, and resolving
  the difference.
  ::
  ::card{icon="i-lucide-receipt" title="Ledger entries" to="/docs/money/ledger-entries"}
  What an entry and a line are, why nothing is ever edited, and how to find one.
  ::
  ::card{icon="i-lucide-lock" title="Periods" to="/docs/money/periods"}
  Closing a range so its figures stop moving, and reopening it when an administrator must.
  ::
  ::card{icon="i-lucide-file-down" title="Exports" to="/docs/money/exports"}
  The CSV shaped for the SU's accounting, and the nominal codes each ledger line maps to.
  ::
::

## If something goes wrong

- **"The dashboard could not be read."**: the ledger query failed or you no longer hold a
  finance permission. Press **Refresh**; if it persists, check your role under
  [roles and the committee year](/docs/people/roles-and-the-committee-year).
- **The Entries buttons are missing**: you hold `finance.summary` and not `finance.read`. The
  committee sees the season's totals, not the individual entries behind them.

## Related pages

- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [The desk](/docs/box-office/the-desk)
- [The till](/docs/show-night/the-till)
- [Bar reports](/docs/bar/reports)
