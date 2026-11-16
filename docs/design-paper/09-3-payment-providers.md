# Payment providers

No provider is cheapest everywhere: a flat percentage wins on cheap tickets and a lower percentage with a fixed fee wins on larger baskets, so the provider interface should let a theatre choose per channel. UK figures, checked on 16 November 2026.

| Provider | In person | Online | Verified on the provider's page |
| --- | --- | --- | --- |
| [Stripe](https://stripe.com/gb/pricing) | 1.4% + 10p (UK and EEA cards) | 1.5% + 20p standard UK cards; 2.8% + 20p premium UK; 2.5% + 20p EEA; 3.15% + 20p other | Yes |
| [SumUp](https://www.sumup.com/en-gb/pricing/) | 1.69% pay as you go; 0.99% on a £19 monthly plan | 2.5% | Yes, though the page disagrees with itself on plan terms |
| Square | 1.75% | 1.4% + 25p UK cards | No, from third-party pages |
| GoCardless | None | 1% + 20p Direct Debit, capped at £4 | No, from third-party pages |

Stripe's pricing page lists no charity discount. None of the four was confirmed to offer one.

## What a ticket costs to sell

| Sale | Stripe online | SumUp online | Stripe reader | SumUp reader |
| --- | --- | --- | --- | --- |
| One £8 ticket | 32p | 20p | 21p | 14p |
| A £24 basket of three | 56p | 60p | 44p | 41p |
| A £60 basket | £1.10 | £1.50 | 94p | £1.01 |

Online, the two meet at a £20 basket: below it SumUp's flat 2.5% is cheaper, above it Stripe is. For comparison, a hosted ticketing service adds 22p to 60p a ticket on top of card fees.

## Consequences for the design

- **One charge per basket**, never per ticket, so a fixed fee is paid once.
- **Provider per channel.** A theatre may use one provider at the bar and door and another online.
- **An optional booking fee** as a setting, per order or per ticket, shown before checkout, for theatres that pass fees on.
- **Fees recorded in the ledger** against each payment, so a show's settlement is net of real costs.
- **Direct Debit suits memberships and regular giving**, not tickets, and belongs with Membership and Fundraising.
- **First provider:** the choice is not critical, as decided. NNT's reader-only use of SumUp makes SumUp the natural first in-person provider.

## Still to check

- Square's and GoCardless's current rates on their own pages.
- Whether SumUp's online checkout API suits an embedded checkout.
- Each provider's terms for unincorporated societies and student groups.

## Sources

- [Stripe UK pricing](https://stripe.com/gb/pricing)
- [SumUp UK pricing](https://www.sumup.com/en-gb/pricing/)
- [Stripe and Square compared](https://www.businessexpert.co.uk/payment-processing/stripe-vs-square/) (third party, source of the Square figures)
- [UK payment gateways compared](https://www.businessexpert.co.uk/payment-processing/best-payment-gateway) (third party, source of the GoCardless figures)
