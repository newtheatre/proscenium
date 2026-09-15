---
title: Box office
description: The desk, passes, the programme and its reference data, and access profile verification.
module: Ticketing
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-ticket
---

Everything under **Manage, Box office** in the console. Two screens are operational, the desk
and pass issuing, and are used on a show night; the rest is the standing configuration of the
programme, done at a desk in the daytime.

::callout{icon="i-lucide-info" color="info"}
**The theatre takes no cash and no online payment.** Every payment is CARD on the Students'
Union's physical SumUp reader, or COMP. The screens record what the reader took; nothing here
initiates a charge.
::

## Who holds what

The Box office role holds `ticketing.read`, `ticketing.write` and `ticketing.export`, which is
every screen below except one. Narrowing what a pass covers once passes are live needs
`ticketing.manage`, which the Manager role holds. Verifying an access profile needs
`access.verify`, which only the Accessibility officer holds: general box office cannot open that
screen or see what it holds. Approving a comp or a refund is not a box office permission at all;
it derives from tonight's confirmed duty manager shift, or from the Manager role.

## On a show night

::card-group
  ::card{icon="i-lucide-search" title="The desk" to="/docs/box-office/the-desk"}
  Find a booking by scan, reference or name; take its payment on the reader; comps; refunds.
  ::
  ::card{icon="i-lucide-ticket-check" title="Issuing passes" to="/docs/box-office/issuing-passes"}
  Sell a pass to a named buyer, or fulfil one they requested online.
  ::
::

## The programme

::card-group
  ::card{icon="i-lucide-drama" title="Shows and performances" to="/docs/box-office/shows-and-performances"}
  Add a show, schedule its performances, price it, assess its warnings, publish it and watch it sell.
  ::
  ::card{icon="i-lucide-map-pin" title="Venues" to="/docs/box-office/venues"}
  Where a performance happens: capacity, an optional room for blackouts, external venues.
  ::
  ::card{icon="i-lucide-calendar-range" title="Seasons" to="/docs/box-office/seasons"}
  The committee years a show belongs to.
  ::
  ::card{icon="i-lucide-layout-grid" title="Show categories" to="/docs/box-office/show-categories"}
  The headings the public listing groups shows under.
  ::
  ::card{icon="i-lucide-tag" title="Ticket types" to="/docs/box-office/ticket-types"}
  What a seat is sold as and its base price; access, companion and members-only types.
  ::
  ::card{icon="i-lucide-wallet-cards" title="Pass types" to="/docs/box-office/pass-types"}
  A pass product: its window, price points, cap and the shows it admits to.
  ::
  ::card{icon="i-lucide-triangle-alert" title="Content warnings" to="/docs/box-office/content-warnings"}
  The vocabulary every show warns from.
  ::
::

## Access

::card-group
  ::card{icon="i-lucide-accessibility" title="Access profiles" to="/docs/box-office/access-profiles"}
  Sight the evidence behind a declaration and agree the wording the door reads out.
  ::
::

## Related pages

- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [The door](/docs/show-night/the-door)
- [Revenue by show](/docs/money/revenue-by-show)
