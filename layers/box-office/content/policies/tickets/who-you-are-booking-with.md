---
title: Who you are booking with
order: 20
revised: 2026-11-18
---

::when{has="core.organisation.legal-name"}
You are booking with :setting{name="core.organisation.legal-name"}, which runs :setting{name="core.site.name" fallback="this theatre"}.

#otherwise
You are booking with :setting{name="core.site.name" fallback="this theatre"}.
::

::when{has="core.organisation.address"}
Our address is :setting{name="core.organisation.address"}.
::

::when{has="core.organisation.contact-email"}
You can reach the box office at :setting{name="core.organisation.contact-email"}.
::

::when{has="core.organisation.contact-phone"}
You can also call us on :setting{name="core.organisation.contact-phone"}.
::

Your booking is confirmed when we send you a confirmation email, not when you press the button. If you do not receive one within a few minutes, check your junk folder, then contact us.

You must be :setting{name="box-office.orders.buyer-minimum-age"} or over to book. If you book for other people, please make sure they know these terms and our [house rules](/policies/visiting).
