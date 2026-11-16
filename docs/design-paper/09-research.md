# Research

No open-source system covers a theatre's box office together with its volunteers, bar and training, and a self-hosted theatre on Cloudflare should cost about 5 US dollars a month before card fees. Findings were gathered on 16 November 2026; the sub-tabs hold the detail and the sources.

## What the research changes in this paper

| Finding | Effect |
| --- | --- |
| The open-source ticketing projects either lack theatre operations or keep reserved seating and box office for paid editions | A fully open box office with seating is the platform's clearest reason to exist |
| Commercial systems treat customer records, donations at checkout, gift vouchers, waiting-list offers and an embeddable widget as standard | These are added to the Box office module |
| Email sending on Cloudflare needs the paid Workers plan | Confirms the decision to assume the paid plan |
| D1 allows 100 bound parameters a query and 10 GB a database | Confirms chunking at 90 and one database per theatre |
| Card fees with a fixed pence part hit cheap tickets hardest | Charge per basket, not per ticket, and let a theatre pick its provider per channel |
| Hosted ticketing charges about 22p to 60p a ticket on top of card fees | A simple way to show a theatre what self-hosting saves |

## Limits of this research

- Two official pricing pages could not be read on the day (TicketSource and Square). Their figures come from third-party pages and are marked as unverified.
- Vendor feature lists are marketing. Nothing here was tested hands-on.
- No theatre other than NNT has been asked what it needs. That is still the most valuable research left.
