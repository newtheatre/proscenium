# 1. Scope

Companies covers outside groups from first contact to final settlement. It does not sell tickets, book rooms, plan the programme or take money itself: it asks the modules that do.

## In

- **Companies.** Name, public name, legal name, registered numbers, address, website, short public description, invoice email and tax number for billing. Archive, merge duplicates, search.
- **Contacts.** People who act for a company, each an account (an unclaimed one until they sign in, as Identity makes for guests), with a role label, a primary flag, what they are sent, and a day-of phone. A person may be a contact of several companies.
- **Engagements.** One company's dealings for one production (kinds `visiting`, `act`) or one hire (kind `hire`), with its life cycle from enquiry to settled. A production has at most one live engagement.
- **Agreements.** The deal in structured terms (deal type, split, guarantee, hire fee, deposit, guest places, deadlines, clauses), versioned, sent to a contact and accepted online, with a signed file attached where a paper contract exists.
- **Calls.** Get-in, technical, dress, get-out and other times in a space, with notes, shown to the contact and on Festival's venue-day sheet.
- **Company people.** Who will be in the building for an engagement (names, roles, optional account), for the fire roll, building induction and the venue manager.
- **Tech notes and files.** The agreed technical notes and the company's rider and plans, as core files.
- **Guest allocations.** Guest places per performance from the agreement; the contact names guests before a deadline; Box office issues them as complimentary tickets.
- **The contact's view.** My account > Companies: each engagement with dates, calls, venue contact, tech notes, people, guests, agreement, settlement and the panels other modules contribute (Festival's information, Productions' tasks).
- **Settlements.** After the last performance: the production's box office figures from Finance, the agreement applied (split, guarantee, hire fee, charges contributed by other modules), a balance either way, agreed by the contact, approved by a second person, posted once.
- **Hire as a paid service.** A hire engagement carries the hire fee and deposit Spaces left out (its question 6, SP-43). The room itself stays a Spaces booking.

## Out

| Not here | Where |
| --- | --- |
| Selling tickets, holds, complimentary tickets | Box office; it contributes to Companies' point `companies.guest-issuer` (part 4) |
| Room bookings and their clashes | Spaces |
| Calls for proposals, review, the unplaced tray, the scheduling board | Programme planning |
| Telling acts their slots when a season is published | Programme planning; Companies contributes the contacts |
| Festival timetable, festival wording, venue-day sheet | Festival; Companies contributes a section and a panel |
| Invoice documents, payment terms, purchase orders, aged debt | Invoices and exports (`invoicing`) |
| Funding awarded to acts | Budgets and claims; shown on a settlement as a note only |
| Rights holders and licensing agents | Productions (`productions_rights_holders`) |
| Sponsors and their benefits | Fundraising; it hangs a Sponsorships tab off the company |
| Bank details of payees | Payments' outgoing-payments store (amendment in spec 9) |
| Taking money | Payments, through `payments.settlement` |
| A company's own production tasks and show reports | Productions; visible to contacts through the fact |

## Assumptions of other modules

| Module | Assumed | Status |
| --- | --- | --- |
| Core (identity) | Unclaimed accounts for guests, record-scoped facts, `core.record-tab`, `core.record-resolver`, `core.account-section`, `core.search-source`, `core.record-fact` | Built |
| Core (domain) | Productions with `kind` (`own`, `visiting`, `hire`, `event`) and free-text `company_name`; a service to set `company_name` | Kind built; the setter is a small addition (C-68, asked of Festival-ready changes) |
| Finance | `postEntries`, `reversePosting`, `finance.system-account`, `productionStatement(productionId)` | Built |
| Box office | Staff holds with a label, complimentary orders on a complimentary ticket type | Built; its contribution to `companies.guest-issuer` is new (BO-75) |
| Payments | Intents and `payments.settlement` for deposits and hire fees paid at the desk or online | Built |
| Invoicing | Points `invoicing.line-owner` and `invoicing.counterparty`; listens for `companies.settlement.approved`; events `invoicing.invoice.paid` and `.credited` | Agreed with spec 9 |
| Programme planning | Event `programme-planning.entry.accepted`; points `programme-planning.entry-contacts` and `.entry-source` | Agreed with spec 1 |
| Festival | Point `festival.sheet-section`; contributes to `companies.engagement-panel` | Agreed with spec 2 |
| Budgets | Contributes awards to `companies.settlement-note` | Agreed with spec 8 |
| Reports | Kit point `core.measure` | Spec 12's contract |

## Glossary

Words this module owns. Festival may show "act" for a company on its public pages; staff screens keep these words.

| Word | Meaning | Not to be confused with |
| --- | --- | --- |
| company | Any outside organisation the theatre deals with: a touring company, a student society, a band, a festival act, a hirer | Core's `company_name`, which is display text on a production and is kept in step with the company's public name |
| contact | A person who acts for a company; an account | Communications' contact lists; an emergency contact (Identity) |
| engagement | One company's dealings with the theatre for one production or one hire | Programme planning's "entry", which is a place in a season's plan before a production exists |
| agreement | The versioned terms of an engagement, accepted by a contact | A site policy (core) or a booking term (Box office) |
| deal type | How money is shared: `split`, `guarantee`, `guarantee-or-split` (the higher), `hire`, `none` |  |
| call | A time a company is in a space outside performances: get-in, technical, dress, get-out, other | A front-of-house call time on a shift |
| company people | People from the company who will be in the building for an engagement | Credits (core), which are public billing |
| guest allocation | The guest places a company may name for one performance | A staff hold; a complimentary request (Box office) |
| guest | A person a contact names for a guest place; an account, often unclaimed |  |
| settlement | The statement of what is owed either way after an engagement, and its posting | Payments' settlement of an intent, which is a different thing: always "payment settlement" outside Payments |
| balance | A settlement's result: positive when the theatre owes the company, negative when the company owes the theatre |  |
