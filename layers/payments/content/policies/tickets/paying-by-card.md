---
title: How you can pay
order: 55
revised: 2026-11-18
---

::when{fact="payments.card-providers" not=""}
Card payments are taken securely by :fact{name="payments.card-providers"}. We never see your card number.

#otherwise
Card payments are taken by a payment company. We never see your card number.
::

::when{fact="payments.cash" is="true"}
You can also pay in cash at the box office.
::
