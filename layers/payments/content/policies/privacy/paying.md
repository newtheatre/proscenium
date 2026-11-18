---
title: When you pay
order: 70
revised: 2026-11-18
---

::when{fact="payments.card-providers" not=""}
Card payments are taken by :fact{name="payments.card-providers"}. Your card details go straight to them and never touch our systems. They tell us whether the payment succeeded, the amount, the type of card and its last four digits, so that we can match payments to orders and make refunds. They are responsible for what they do with your card details, and their own privacy notices apply.

#otherwise
When we take a card payment, your card details go straight to the payment company and never touch our systems. They tell us whether the payment succeeded, the amount, the type of card and its last four digits, so that we can match payments to orders and make refunds.
::
