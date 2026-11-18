---
title: Who we are
order: 20
revised: 2026-11-18
---

::when{has="core.organisation.legal-name"}
This website is run by :setting{name="core.organisation.legal-name"}.

#otherwise
This website is run by :setting{name="core.site.name" fallback="this theatre"}.
::

::when{has="core.organisation.address"}
Our address is :setting{name="core.organisation.address"}.
::

::when{has="core.organisation.contact-email"}
Contact us at :setting{name="core.organisation.contact-email"}.
::

::when{has="core.organisation.charity-number"}
Registered charity number :setting{name="core.organisation.charity-number"}.
::

::when{has="core.organisation.company-number"}
Registered company number :setting{name="core.organisation.company-number"}.
::
