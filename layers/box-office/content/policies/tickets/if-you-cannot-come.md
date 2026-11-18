---
title: If you cannot come
order: 80
revised: 2026-11-18
---

::when{setting="box-office.cancellations.by-buyer" is="true"}
**Cancelling.** You can cancel paid tickets up to :setting{name="box-office.cancellations.until-before"} before the performance starts, using the link in your confirmation email. We refund the price to the card you paid with.

#otherwise
**Cancelling.** Once you have paid, we cannot normally refund tickets, because we may not be able to sell them again. If something serious stops you coming, contact the box office as early as you can. We will help if we are able to, though we cannot promise.
::

::when{setting="box-office.cancellations.fee" above="0"}
Where we refund a cancelled ticket, we keep :setting{name="box-office.cancellations.fee"} for each ticket to cover our costs.
::

::when{setting="box-office.exchanges.offered" is="true"}
**Swapping.** The box office can swap your tickets to another performance of the same show, if there is room. Ask up to :setting{name="box-office.exchanges.until-before"} before your original performance starts. If the new tickets cost more, you pay the difference. If they cost less, we refund it.
::
