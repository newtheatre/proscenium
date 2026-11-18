---
title: Tell us if something is wrong
order: 80
revised: 2026-11-18
---

::when{has="core.organisation.contact-email"}
If you cannot use part of this site, or need information in another format, contact :setting{name="core.organisation.contact-email"}.

#otherwise
If you cannot use part of this site, or need information in another format, please contact us.
::

::when{has="core.organisation.contact-phone"}
Or call :setting{name="core.organisation.contact-phone"}.
::

We will reply within :setting{name="core.complaints.reply-within"}. Tell us the page and what happened, and what you use to browse if you can.
