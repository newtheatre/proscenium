# Comparable systems

Seven systems were compared, and none joins ticketing to the running of a volunteer theatre. Checked on 16 November 2026.

| System | Kind | What it covers | What it lacks for us |
| --- | --- | --- | --- |
| [pretix](https://pretix.eu/about/en/features) | Open source with hosted and enterprise editions | Ticket shop, seating plans with an editor, add-ons, donations, memberships and passes, waiting list with timed offers, embeddable widget, box-office, scanning and kiosk apps, plugins | Anything beyond ticketing; some features only in paid editions; needs a server |
| [Hi.Events](https://github.com/HiEventsDev/hi.events) | Open source, AGPL-3.0 with extra terms | Events, tiered and donation tickets, promo codes, waiting lists, check-in, Stripe payouts, API and webhooks | Reserved seating and box office need an enterprise licence; needs a server and PostgreSQL |
| [Spektrix](https://www.spektrix.com/en-gb/features) | Commercial, hosted | Box office, seating, customer records, email marketing and automation, donations, memberships, agents and promoters | Volunteers, bar, training, rooms; priced for funded venues |
| [Ticket Tailor](https://www.tickettailor.com/pricing) | Commercial, hosted | Simple online ticketing; 60p a paid ticket, or from 22p prepaid; 50% off for registered charities | Theatre operations; a per-ticket fee for ever |
| TicketSource | Commercial, hosted | Popular with UK amateur groups; no monthly fee, a fee per paid online ticket (unverified, pricing page unavailable) | Theatre operations |
| Ticketsolve | Commercial, hosted | Box office and customer records for UK and Irish venues | Volunteers, bar, training |
| [Propared](https://propared.com/for-theatre) | Commercial, hosted | Production schedules, calls, rehearsal and show reports, shared read-only pages with no sign-in | Ticketing, money, membership |

For pretix, the licence and technology were not stated on the page read; they should be checked before pretix is cited anywhere public.

## Features to match in the box office

These appear across the ticketing systems often enough to be expected by anyone who has used one.

- An embeddable booking widget for a theatre's existing website.
- Waiting-list offers that go to the next person automatically with a time limit.
- Gift vouchers and promotional codes.
- A donation added at checkout.
- A customer record with order history and simple segments for mailings.
- A reminder for a basket left unpaid.
- Allocations for agents, promoters or a visiting company.
- A kiosk or desk mode and fast scanning on phones.
- Calendar and wallet passes.

## Ideas worth borrowing elsewhere

- **Read-only shared pages with no sign-in** (Propared), for a call sheet or a rota sent to people who will never make an account.
- **Plugins** (pretix), which the module manifest already allows.
- **Charity pricing** is a selling point for hosted rivals; being free is a stronger one, and the paper should say so plainly on the public site.

## Where the platform stands apart

- One system for the audience and for the people who run the building.
- No per-ticket fee and no server to maintain.
- Seating and box office in the open-source edition, because there is only one edition.
- Operational modules (rota, bar, training, rooms) that no ticketing product has.

## Sources

- [pretix features](https://pretix.eu/about/en/features)
- [Hi.Events repository](https://github.com/HiEventsDev/hi.events)
- [Spektrix features](https://www.spektrix.com/en-gb/features)
- [Ticket Tailor pricing](https://www.tickettailor.com/pricing)
- [Propared for theatre](https://propared.com/for-theatre)
- [Ticketsolve's own comparison with Spektrix](https://ticketsolve.com/spektrix-vs-ticketsolve) (vendor material)
- [A competitor's round-up of platforms for UK theatre groups](https://tickts.co.uk/blog/best-ticketing-platforms-theatre-groups-uk) (source of the TicketSource claims)
