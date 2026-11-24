# Companies: module specification

Nov 23, 2026 · @Matthew Adcock

Companies is a new switchable module (id `companies`, story prefix CO) that holds every outside group the theatre works with as one record: a visiting company, a festival act and a hirer are the same thing with different dealings. It owns the company, its contacts, each engagement (the company's dealings for one production or one hire), the agreement, guest places, the calls and people in the building, the contact's own view of all of this, and the settlement at the end.

## Why one module

The catalogue had "allocations held for a visiting company" in Box office, the map put the performer view in Festival, and Spaces left paid hire for later (its question 6). All three are an outside group with contacts, people, dates, an agreement and sometimes money owed either way. Built separately they would each grow a contact list, a terms field and a money screen. The map's Overview (third round) merged them; this spec is that merge.

## The shape in one paragraph

A **company** has **contacts** (accounts, often unclaimed until they sign in). For each show or hire it has an **engagement** of kind visiting, act or hire, linked to a core production or, for a private hire, to Spaces bookings only. The engagement carries an **agreement** (versioned terms the contact accepts online), **calls** (get-in, technical, get-out), **company people** (who comes into the building), **guest allocations** per performance (named by the contact, issued as complimentary tickets by Box office) and, after the last performance, a **settlement**: the production's box office figures from Finance with the agreement's terms applied, agreed by the contact, approved by a second person and posted once to the ledger.

## Who it serves

| Person | What they get |
| --- | --- |
| Programmer or theatre manager | One list of every outside group, its history, and what is outstanding (unsigned agreement, guest names due, settlement due) |
| A company's contact | My account > Companies: their dates, calls, venue contact, tech notes, guest places to name, agreement to accept and settlement to agree. No console access |
| Finance officer | Settlements worked out from the ledger, approved by someone other than the preparer, posted once, handed to Invoices when that module is on |
| Venue manager on the day | The day's get-ins and get-outs per space, and each company's day-of contact |

## Decisions taken in this spec

- **No fixed kind on a company.** What a company is to the theatre comes from its engagements (mine) and other modules' relationships such as sponsorships (Fundraising's), which hang off the company page through `core.record-tab`.
- **Authority from facts, never standing grants** (decision 0009). A contact's rights come from the fact `companies.contact-of`, true while they are an active contact of the company engaged on a production. This replaces the `visiting-company` grant that Box office's spec names for `box-office.report.view` and `finance.ledger.view`.
- **Money once.** A settlement posts once: at approval when Invoices is off, at issue through `invoicing.line-owner` when it is on. Awards (Budgets) are shown, never posted here. Deposits go through Payments, never invoices.
- **No bank details here.** Payee details belong to the Payments outgoing-payments store that Invoices and Budgets are specifying.
- **Calls are Companies' own times**, not Spaces bookings, so Companies does not require Spaces; Spaces treating them as blockers is an open question (part 9, Q4).

## Size

13 tables, 6 record types, 20 abilities (5 held through a fact), 11 settings, 46 stories (5 gate, 29 first release, 12 later), 49 never-regress cases, 9 questions. Requires `finance` and `payments`. Uses `box-office`, `spaces`, `invoicing`, `programme-planning`, `festival`, `communications`, `budgets`, `productions`, `forms`.

## Tabs

Parts 1 to 9 follow the first round's format; Sources lists what was read. Agreements with other third-round threads are recorded in part 4, "Agreed with other specs".
