# 7. Stories

Companies has 46 stories, CO-01 to CO-46 (CO is a new prefix, to be registered): 5 gate, 29 in the rest of the first release and 12 later. Each cites the rules in part 3 it delivers, and is done when those rules' cases in part 8 pass. CO-20 is Festival's FE-08, moved here by agreement.

|  | Gate | Rest of first release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 5 | 29 | 12 | 46 |

The gate is the proof that money and guest places cannot be counted twice. Nothing else is worth building until it passes.

## Gate

| Id | As | I want | So that | Done when | Rules | Rests on |
| --- | --- | --- | --- | --- | --- | --- |
| CO-01 | a developer | the module, its 13 tables, record types, abilities, fact and ledger accounts declared | everything else has somewhere to stand | Switching it on makes the seven locked accounts; CI's manifest checks pass | part 2, part 6 | The kit; Finance |
| CO-02 | a developer | every move to be one guarded update with its history row and event | two people acting at once cannot both succeed | Two concurrent moves from the same state: one succeeds, one is refused, one history row | moves table | CO-01 |
| CO-03 | a finance officer | a settlement to post exactly once, however often approval is retried | the ledger never counts a company's share twice | Approval retried three times, and run with Invoices on and off: one sealed posting per settlement version | S8, M1 | CO-01; Finance's idempotency key |
| CO-04 | a contact | naming the last guest place at the same moment as a colleague to give it to only one of us | a performance is never over its places | Two names for one remaining place at once: one issued, one told it has gone | L3 | CO-01; BO-75 |
| CO-05 | a developer | the fact `companies.contact-of` recomputed in the batch that changes it | an ended contact loses access at once | Ending a contact, the next request by that account to their engagement is refused | part 4, Fact | CO-01 |

## Companies and contacts

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-06 | an administrator | to add a company and be warned of a near match | we keep one record per group | "The Splinter Theatre" warns of "Splinter Theatre" and offers it | G1 | First |
| CO-07 | an administrator | to add contacts by email, with a role, a primary and what they are sent | the right person gets the right message | A new email makes an unclaimed account; one primary at most | G2, G4 | First |
| CO-08 | a contact | to claim my account from the welcome email and see Your companies | I can act without a console login | The claim link signs me in and the account menu shows Companies | G2, fact | First |
| CO-09 | an administrator | to archive and restore a company | old groups stop cluttering the list | Archive with a live engagement refuses; archived rows sit below the divider | G6 | First |
| CO-10 | an administrator | to merge duplicate companies, and undo within the period | history joins up without risk | Everything moves; undo restores both; the event fires once each way | G5 | First |
| CO-11 | a room manager | to record a private person hiring as a company | a birthday party hire works like any other | Erasing the person anonymises the company's name and address, settlement figures kept | G7 | First |

## Engagements

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-12 | a programmer | to link a visiting company to a production | the show page and the company agree | `company_name` on the production follows the company's public name; a second engagement on that production refuses | E1, E6, G3 | First |
| CO-13 | a programmer | an accepted call entry to become an act engagement without retyping | the call flows into the company record | One `entry.accepted` event, delivered twice, makes one engagement in `confirmed` with the applicant as primary | E2 | First |
| CO-14 | a room manager | to make a hire engagement and link its room bookings | the hire's dates come from Spaces | Confirming needs a linked confirmed booking, or calls when Spaces is off | E3 | First |
| CO-15 | a member of the public | to ask to hire a room through a form | the enquiry lands where it is handled | The form's outcome action makes an `enquiry` hire engagement and the company | E1, forms | First |
| CO-16 | a programmer | to cancel an engagement with a reason | a show that falls through is closed cleanly | Allocations released, a sent agreement withdrawn, the production untouched | E5 | First |
| CO-17 | a programmer | an engagement to complete itself after its last date | settlements start on time | The day after the last date it is `completed` and a draft settlement exists (or `settled` for deal `none`) | E4 | First |

## Agreements and the contact's view

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-18 | a programmer | to draft an agreement whose fields follow the deal type, and send it | terms are clear and complete | A split without a share refuses to send; sending moves to `offered` and notifies | A1, A2 | First |
| CO-19 | a contact | to accept or decline the agreement online | no paper chase | One answer per version; accepting moves to `agreed` | A3 | First |
| CO-20 | a contact | to see my slots, calls, venue contact, arrival notes and tech notes in one place (was FE-08) | I arrive knowing what happens when | The page lists performances, calls and bookings in time order in the theatre's time zone, and Festival's panel when the season is a festival | part 5 | First |
| CO-21 | an administrator | to record an agreement signed on paper | a company that will not click still counts | `recorded_by` differs from responder; the sender cannot record their own | A3 | First |
| CO-22 | a programmer | to change terms as a new version | what was accepted is never rewritten | Version 2 supersedes 1; until accepted, settlements apply version 1 | A1, A5 | First |

## The day

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-23 | a technical manager | to set get-in, technical and get-out calls in a space | the company and crew know the plan | A call across 04:00 refuses; a change after confirmation notifies once per five minutes | D1, D2, D4 | First |
| CO-24 | a contact | to list who from my company will be in the building | the venue knows who is on site | Contacts edit until the first date; staff after; under-18 shows a badge | D3 | First |
| CO-25 | a venue manager | to see the day's get-ins and get-outs on the venue-day sheet | I run the day from one page | Section shows that space and operating day; phone only with `contact.view-details` | part 4 | With Festival |

## Guests

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-26 | a box office manager | guest places held for each performance from the agreement | they never go on sale by mistake | Accepting makes one allocation per performance and a staff hold for its places | A4, L1 | First |
| CO-27 | a contact | to name guests and have their tickets sent at once | guests arrive with tickets | Naming issues a complimentary order through Box office; the guest gets the usual email | L2 | First |
| CO-28 | a contact | to withdraw a guest before the deadline | I can swap who comes | Tickets cancelled, places back in the hold | L4 | First |
| CO-29 | a box office manager | unnamed places released at the deadline, after a reminder | unused seats can be sold | Reminder at `remind-before`; at `names-due` places go on sale unless `keep-unnamed` | L1, L5 | First |

## Settlements

| Id | As | I want | So that | Done when | Rules | Release |
| --- | --- | --- | --- | --- | --- | --- |
| CO-30 | a finance officer | a draft settlement worked out from the ledger and the agreement | no spreadsheet | Split, guarantee and guarantee-or-split each give the expected lines and balance to the penny | S1 to S4 | First |
| CO-31 | a finance officer | a hire settlement with the fee by its basis | hirers are charged correctly | Flat, per performance and per hour each give the expected fee; the balance is negative | S2, S4 | First |
| CO-32 | a contact | to agree a proposed settlement or ask a question | I can check before money moves | Figures frozen on proposal; a query returns it to the preparer | S5, S6 | First |
| CO-33 | a finance officer | to approve a settlement someone else prepared | no one settles alone | The preparer is refused; approval posts (Invoices off) or announces (Invoices on) | S7, S8 | First |
| CO-34 | a finance officer | to record a payment against a settlement while Invoices is off | it shows as paid | Payments summing to the balance make it `paid` and the engagement `settled`; overpaying refuses quoting both figures | M4, S9 | First |

## Later

| Id | As | I want | So that | Rules | Rests on |
| --- | --- | --- | --- | --- | --- |
| CO-35 | a room manager | to take a deposit and return or keep it | hires are secured | M2, M3 | Payments |
| CO-36 | a finance officer | to correct an approved settlement by a new version | mistakes are fixed without editing | S10 | Finance's reversal |
| CO-37 | a finance officer | an interim settlement before a long run ends | cash flow for a company on tour | S1 | CO-30 |
| CO-38 | a finance officer | approved settlements to become invoices and bills | one list of who owes what | S8 | Invoicing (spec 9) |
| CO-39 | a finance officer | awards shown on a settlement as notes | the company sees the whole picture | S2 | Budgets (spec 8) |
| CO-40 | a programmer | to message "all companies on Saturday" | festival-day notices go to the right people | part 4 | Communications |
| CO-41 | a contact | to see my production's sales | I know how the run is going | part 5 | Reports' `readMeasure` |
| CO-42 | a treasurer | settlement and guest figures in reports | the year can be reviewed | part 4 | Reports (spec 12) |
| CO-43 | a contact | my production's tasks and show reports on my engagement page | one place for everything | part 4 | Productions (spec 4) |
| CO-44 | a room manager | kit hire and other charges added to a settlement | one bill per company | S2 | Inventory (spec 11) |
| CO-45 | a room manager | calls to block rooms in Spaces | no one books over a get-in | D2 | Spaces amendment SP-53; Q4 |
| CO-46 | an applicant | to pick my company in a call form, and staff to see waiting engagements in the tray | known companies are not retyped | E2 | Forms; Programme planning |

If the first release has to shrink, cut from the end: CO-25 waits for Festival; then CO-11 (private hirers); then CO-21 (paper signatures); then hire engagements CO-14, CO-15 and CO-31 together, leaving visiting companies and acts.
