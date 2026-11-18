---
title: Who we are
order: 20
revised: 2026-11-18
---

::when{has="core.organisation.legal-name"}
:setting{name="core.site.name" fallback="this theatre"} is run by :setting{name="core.organisation.legal-name"}. We decide how your personal data is used, which the law calls being the "controller".

#otherwise
We decide how your personal data is used, which the law calls being the "controller".
::

::when{has="core.organisation.address"}
Our address is :setting{name="core.organisation.address"}.
::

::when{has="core.organisation.charity-number"}
We are a registered charity, number :setting{name="core.organisation.charity-number"}.
::

::when{has="core.organisation.company-number"}
We are a registered company, number :setting{name="core.organisation.company-number"}.
::

::when{has="core.privacy.contact"}
For anything about your personal data, contact :setting{name="core.privacy.contact"}.

#otherwise
For anything about your personal data, use the contact details on this website.
::
