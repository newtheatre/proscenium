# Module catalogue

Sixteen modules sit on the core. Each can be switched off without breaking another, and a dependency is declared, never assumed.

## Priority

Box office is the most important module. Programming and production management are the least: NNT handles proposals on paper and in meetings, and many theatres have no proposals process.

| Tier | Modules |
| --- | --- |
| 1. Essential | Public site, Box office, Payments, Finance (the ledger) |
| 2. Running the theatre | Front of house, Spaces, Bar and kiosk, Training, Membership, Communications |
| 3. Wider adoption | Inventory, Fundraising, Governance, Reports |
| 4. Later, if wanted | Programming, Production management |

The detailed sections below keep catalogue order, not priority order.

| Module | What it does | Needs |
| --- | --- | --- |
| Public site | What's on, production pages, archive, about and policy pages | Core |
| Programming | Proposal windows, review, season planning | Core |
| Production management | Team, casting, rehearsals, tasks, per-show budget | Core |
| Box office | Tickets, seating, passes, refunds, door scanning | Core |
| Payments | Pluggable providers for taking and returning money | Box office or Bar |
| Front of house | Rota, tonight screen, checklists, incidents, night report | Core |
| Bar and kiosk | Products, till, tabs, stock, age checks | Payments |
| Spaces | Room and resource booking with policy and approvals | Core |
| Inventory | Props, costume, set and technical kit | Core |
| Training | Catalogue, sessions, records, gates | Core |
| Membership | Terms, fees, verification, benefits | Core |
| Communications | Mailing lists, audience messages, consent | Core |
| Finance | Ledger, budgets, expenses, period close, exports | Core |
| Fundraising | Donations, sponsors, campaigns | Finance, Payments |
| Governance | Committee record, handover, documents, elections | Core |
| Reports | Cross-module reports and exports | Any |

## Public site

- What's on, with filters by season, venue and type.
- A page per production: dates, cast and creative team, content warnings, age guidance, access information, booking.
- A searchable archive of past productions and the people credited on them.
- Content pages for about, history, policies, getting involved and news.
- Search-engine metadata, social cards, redirects from an old site's addresses.

## Programming

Lowest priority. Most of this is delivered by the form builder (a proposal form with a review workflow), so it may never need to be a module of its own.

- Proposal windows per season, with structured submissions: title, synopsis, team, rights status, budget, technical demands, preferred slot.
- Private drafts, and submissions locked after the deadline.
- Review with private scores, declared conflicts of interest and automatic lockout.
- A recorded decision with its reasons, and feedback returned to proposers.
- A season planner that places chosen shows into slots and spaces.
- Retention rules for unsuccessful proposals.

## Production management

Lowest priority. Credits on the public page and the archive belong to the core production record, and need none of what follows.

- Production team and credits, feeding the public page and the archive.
- Auditions: sign-up slots, panels, private notes, casting offers and acceptances.
- Rehearsal schedule with call sheets and availability, linked to room bookings.
- Tasks and milestones from a template (rights secured, poster approved, get-in, get-out).
- A per-show budget with spend against it, drawn from Finance.
- Performing-rights and script tracking: licence, fees due, restrictions.
- Risk assessments and other documents with sign-off.
- A show report per performance.

## Box office

The most important module. It works entirely within the audience experience and never assumes the buyer is a member. The last seven items were added after the research into other ticketing systems.

- Ticket types, concessions and price bands per production or per performance.
- General admission or allocated seating from a seating plan.
- Holds that expire, baskets, and capacity enforced so the last seat sells once.
- Booking by the customer, at the desk, or by phone on the customer's behalf.
- Passes and season tickets, complimentary requests with approval, and promotional codes.
- Exchanges, cancellations, refunds and a waiting list.
- E-tickets with a code, wallet tickets where available, and door scanning that works offline.
- Access bookings: wheelchair spaces, companion tickets, access requirements.
- Externally ticketed performances, stated plainly at the door and in reports.
- Messages to ticket holders when something changes.

* An embeddable booking widget for a theatre's existing website.
* Waiting-list offers sent automatically to the next person, with a time limit.
* Gift vouchers.
* A donation added at checkout.
* A customer record with order history and simple segments for mailings.
* A reminder for a basket left unpaid.
* Allocations held for a visiting company, agent or promoter.

## Payments

- A provider interface with several implementations: an in-person card reader, online card, cash, invoice, and none (free events).
- A theatre enables any combination per channel: online, desk, bar.
- Every charge is an attempt with a recorded outcome, so an interrupted payment is never ambiguous.
- Refunds go back by the method that took the money, with approval rules.
- End-of-night reconciliation of the reader's total against what the system recorded.

## Front of house

- A rota planned at a desk and worked on a phone: shift templates per performance, sign-up, confirmation, release and reassignment.
- Eligibility rules that ask Training whether a person may take a shift.
- A tonight screen for the duty manager: who is on, what is sold, what is outstanding.
- Pre-show and post-show checklists, with exceptions and reasons.
- An incident and near-miss log with severity routing and follow-up.
- A venue emergency card.
- A backstage board for milestones such as the half and beginners.
- A night report that compiles itself, is signed off and is distributed.
- Volunteer hours recorded from worked shifts.

## Bar and kiosk

- Products, sizes, choices and price lists, including merchandise and programmes.
- A till for a phone or tablet, with tabs, discounts and staff prices.
- Stock by container, deliveries, wastage with reasons, and stocktakes.
- An age-check register for restricted sales.
- Openings that are not tied to a performance, such as a social.
- A licensing export.

## Spaces

- A calendar per space with bookings, recurring series and closures.
- A policy engine: who may book what, how far ahead, for how long, with what notice.
- Priority tiers decided by the system from what the booking is for, not chosen by the booker.
- Approvals, bumping with notice, cancellations and no-shows.
- Requests for spaces the theatre does not control.
- Bookable resources other than rooms, such as a van or a rehearsal piano.

## Inventory

- A catalogue of props, costume, set pieces and technical equipment, with photographs and storage locations.
- Loans to productions and to outside borrowers, with due dates, deposits and condition on return.
- Maintenance and inspection records, such as electrical testing, with expiry reminders.
- Write-off and disposal.

## Training

- A catalogue of training modules with delivery modes: in person, online, on the job.
- Sessions with sign-up, attendance and trainers.
- Records with expiry, and invalidation when the material changes.
- Gates that any module can ask about: may this person use the till, rig a light, be duty manager.
- A practice mode for operational screens.
- First-aid and safeguarding certificates held as records.

## Membership

- Membership types and terms, with or without a fee.
- Verification against an external list, such as a students' union, or by staff.
- Benefits that other modules read: ticket prices, booking rights, voting.
- Honorary and life memberships.

## Communications

- Mailing lists with consent, preferences and one-click unsubscribe.
- A composer with audiences drawn from other modules: ticket holders for a performance, a production's team, lapsed members.
- Templates in the theatre's branding.
- Suppression, bounce handling and a delivery log.

## Finance

- The append-only ledger every money-taking module posts to.
- Budgets per production, department and season, with spend against them.
- Expense claims with receipts and approval.
- Invoices in and out.
- Period close, and exports to an accounting package or a parent body's format.
- Tax handling as a setting: none, VAT, sales tax.

## Fundraising

- Donations at checkout and standalone, one-off or regular.
- Tax-relief declarations where a country has them, such as Gift Aid in the UK.
- Sponsors and patrons with benefits and renewal dates.
- Campaigns with targets and a public total.

## Governance

- The committee or board, with terms of office, shown on the public site.
- A handover pack per post that the system assembles: open tasks, key documents, last year's numbers.
- A document register for policies and minutes, with review dates.
- Elections and votes for members.
- Honours such as fellowships.
- Feedback and bug reports from inside the app.

## Reports

- Sales, attendance and occupancy by performance, production and season.
- Volunteer and training reports.
- Financial summaries per show.
- Returns for licensing bodies and rights holders.
- Every report exportable, and schedulable by email.
