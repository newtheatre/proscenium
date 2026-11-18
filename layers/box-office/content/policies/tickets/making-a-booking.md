---
title: Making a booking
order: 40
revised: 2026-11-18
---

While you choose, we hold your tickets in your basket for :setting{name="box-office.baskets.hold-for"}. After that they go back on sale.

You can book up to :setting{name="box-office.orders.seat-cap"} tickets in one order. For a larger group, contact the box office.

::when{setting="box-office.sales.close-before" above="0"}
Online booking closes :setting{name="box-office.sales.close-before"} before each performance starts. After that, any remaining tickets are sold at the venue.
::
