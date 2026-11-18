---
title: Paying
order: 50
revised: 2026-11-18
---

::when{setting="box-office.checkout.payment-timing" is="pay-now"}
You pay in full when you book.
::

::when{setting="box-office.checkout.payment-timing" is="reserve"}
You reserve your tickets now and pay for them at the box office when you arrive. One reservation can hold up to :setting{name="box-office.reservations.max-tickets-per-order"} tickets.
::

::when{setting="box-office.checkout.payment-timing" is="buyer-chooses"}
You can pay in full when you book, or reserve now and pay at the box office when you arrive. One reservation can hold up to :setting{name="box-office.reservations.max-tickets-per-order"} tickets.
::

Reserved tickets are not yours until they are paid for.
