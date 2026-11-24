# 3. States and rules

Every state change is one guarded update (the predicate on the statement, decision 0003) written in the same batch as its history row and event, so two people acting at once cannot both succeed. Rules are numbered by group: G companies and contacts, E engagements, A agreements, D the day (calls and people), L guests, S settlements, M money.

## Engagement life cycle

_[Diagram: engagement and settlement life cycles · 6 and 5 states]_

An accepted entry from Programme planning starts at Confirmed; every other engagement starts at Enquiry. Completing an engagement opens its settlement, and the settlement being paid settles the engagement.

| From | To | Who | Rule |
| --- | --- | --- | --- |
| (new) | `enquiry` | `companies.engagement.manage`; or the listener on a hire enquiry form | E1 |
| (new) | `confirmed` | Listener on `programme-planning.entry.accepted` | E2 |
| `enquiry` | `offered` | `engagement.manage`, by sending agreement version 1 | A2 |
| `offered` | `agreed` | A contact accepting the sent version, or staff recording a paper signature | A3 |
| `offered` | `enquiry` | The contact declining; staff may revise and send again | A3 |
| `agreed` | `confirmed` | `engagement.manage`; needs a linked production (visiting) or a confirmed Spaces booking (hire) | E3 |
| `confirmed` | `completed` | The daily task, the day after the last performance, call or hire booking ends | E4 |
| `completed` | `settled` | A settlement reaching `approved` with a zero balance, or `paid` | S9 |
| any but `settled` | `cancelled` | `engagement.manage`, with a reason | E5 |

**E1.** An engagement starts in `enquiry` with a company and a kind. A `visiting` or `act` engagement must name a production before it leaves `agreed`; a `hire` may stay without one.

**E2.** An accepted entry from Programme planning opens an engagement of kind `act` (in a festival season) or `visiting` (otherwise) in `confirmed`, linked to the new production, with the applicant as the company's primary contact. If the entry carries a company id, that company is used; otherwise one is found by exact name (case ignored) among unarchived companies or created. No agreement is needed to be `confirmed` by this route, because the call's terms were accepted in the form. Running the listener twice for one entry changes nothing (keyed by `source_ref`).

**E3.** `confirmed` needs: for `visiting` and `act`, a linked production; for `hire`, at least one confirmed Spaces booking carrying the engagement's reference, or calls in a space when Spaces is off. Where `companies.agreements.required` is on, it also needs an accepted agreement.

**E4.** The daily task moves `confirmed` to `completed` once the last of the production's performances, the engagement's calls and its hire bookings has ended. It opens a draft settlement where the deal type is not `none`, or moves the engagement straight to `settled` where it is.

**E5.** Cancelling releases every open guest allocation (L5), withdraws any sent agreement, and leaves a held deposit for a person to return or keep (M3). A production linked to a cancelled engagement is not touched: cancelling a show is core's act.

**E6.** A production has at most one engagement that is not `cancelled` (unique index). Linking a second refuses, naming the first.

## Companies and contacts

**G1.** A company's name is unique among unarchived companies, ignoring case. Creating a near match (same letters ignoring punctuation and "The") warns and offers the existing one.

**G2.** A contact is an account. Adding one by email finds the account by verified address or makes an unclaimed one (Identity's guest rule), never links to an unverified address. Nothing reaches the contact until they sign in, except the messages they are set to receive, which go to that address.

**G3.** While a company is linked to a production through a live engagement, core's `company_name` on that production equals the company's public name. Companies sets it through core's service on link and on rename; a staff edit of `company_name` in core while linked warns that the next rename will overwrite it.

**G4.** Each company has at most one primary contact among live contacts. Ending the primary contact while others remain asks who becomes primary; ending the last contact of a company with a live engagement refuses.

**G5.** Merging two companies moves every contact, engagement and reference to the survivor in one batch, marks the other `merged_into_id` and archived, and announces `companies.company.merged`. A merge is undone within `companies.merges.undo-for` by the same batch reversed, as Identity's account merge is.

**G6.** Archiving a company with a live engagement refuses. An archived company is kept, found by search and restored in one step.

**G7.** A private hirer is a company with `individual` true and `individual_account_id` set. Erasing that account anonymises the company's name, public name and address in the same batch (per-row class), and its settlements keep their figures.

## Agreements

_[Diagram: flow chart · agreement version states, A1 to A6]_

**A1.** An agreement version is a row that never changes except its `state`, and only along this table's moves. Changing terms writes version n+1 with `supersedes_id`; the earlier version becomes `superseded` in the same batch.

**A2.** Sending a draft needs: terms valid for its deal type (split types need a share and basis, guarantee types a guarantee, `hire` a fee), and at least one live contact set to receive agreements. Sending sets `sent_at`, moves the engagement from `enquiry` to `offered`, and notifies those contacts.

**A3.** A sent version is answered once (unique response per version), by a live contact of the engagement's company, signed in. Accepting moves the engagement to `agreed`; declining moves it back to `enquiry`. Staff with `companies.agreement.record` may record an answer given on paper, with the file attached; `recorded_by` then differs from `responder_id`.

**A4.** An accepted version's guest places make one allocation per performance of the linked production, each due `guest_names_due` before the performance starts. A later accepted version changes the places on allocations not yet closed, never below the number already named.

**A5.** Superseding an accepted version needs a new acceptance. Until then the earlier accepted version stays the one a settlement applies (S2).

**A6.** Withdrawing a sent version is allowed until it is answered. A version is never deleted.

## The day

**D1.** A call lies inside one operating day of the space's venue (04:00 to 04:00, decision 0014) and ends after it starts. Two calls of one engagement may not overlap in one space.

**D2.** A call in a space at the same time as a performance or closure in that space warns but is allowed: a get-in often overlaps the previous show's get-out on purpose. Spaces treating calls as blockers is part 9, Q4.

**D3.** Contacts may add, change and remove company people until the first call or performance starts; after that, staff do. A person marked under 18 shows a badge on the venue manager's list.

**D4.** Changing a call after the engagement is `confirmed` notifies the contacts set to receive `schedule`, once per change, batched over five minutes.

## Guests

_[Diagram: flow chart · guest places from hold to ticket or release, L1 to L5]_

**L1.** An allocation is `open` from the agreement's acceptance until its `names_due_at`, then `closed` by the job. While open, its unnamed places are held in Box office as a staff hold labelled "Guests of \<company>", so they never go on sale and never count as sold.

**L2.** A contact names a guest with a name and an email (or picks a previous guest). The guest becomes an account (G2's rule) and is issued a complimentary ticket for the performance at once, through Box office's contribution, which converts places from the hold to a confirmed zero-price order. The guest is sent Box office's usual confirmation.

**L3.** The places named on an allocation never exceed its places (a guarded update on the allocation's count). Two contacts naming the last place at once: one succeeds, the other is told it has gone.

**L4.** Withdrawing a named guest before the deadline cancels their tickets through Box office and returns the places to the hold.

**L5.** At the deadline, or when the engagement is cancelled, unnamed places are released to general sale (`released`) unless `companies.guests.keep-unnamed` is on, in which case they stay held for the box office to issue on the night.

**L6.** Guest tickets are counted and reported as complimentary by Box office. Companies never prices them.

## Settlements

_[Diagram: flow chart · settlement agreement, approval and posting, S5 to S9]_

**S1.** A draft settlement is made by E4, or by `companies.settlement.prepare` at any time after the first performance (an interim figure). Only one version per engagement is not `superseded` or `void`.

**S2.** The draft applies the latest accepted agreement version to Finance's production statement read at `statement_as_of`, and lists lines:

- `split`: company share = `basis` × share. `guarantee`: company share = guarantee. `guarantee-or-split`: the higher of the two, written as the split line plus a `guarantee-top-up` line when the guarantee is higher.
- `hire`: hire fee by its basis (flat, per performance, or per hour of the hire's Spaces bookings or calls), owed by the company.
- Charges contributed through `companies.settlement-charge` (later), owed by the company.
- Notes from `companies.settlement-note` (Budgets' awards), zero-amount and never posted.
- Deposit kept, and adjustments with a label, by the preparer.

**S3.** The basis is gross ticket income less refunds; with `share_basis` `net-of-fees` the theatre's booking fees are also taken off first. VAT is not split: the statement's figures are taken as Finance holds them, net of output tax where the theatre is VAT-registered (part 9, Q5).

**S4.** The balance is the sum of posting lines. Positive means the theatre owes the company; negative means the company owes. Every figure is integer minor units; a share is rounded down to the penny in the theatre's favour, and the rounding is shown.

**S5.** Proposing freezes the figures (trigger), notifies the contacts set to receive `settlement`, and shows it on their engagement page. A contact may agree or query with a note.

**S6.** A query returns it to the preparer, who either supersedes it with a new version (S1) or answers and proposes the same version again.

**S7.** Approving needs `companies.settlement.approve`, refuses the person who prepared it (`approved_by` <> `prepared_by`, checked on the statement), and needs either the contact's agreement or `companies.settlements.approve-without-agreement` days to have passed since proposal with no query.

**S8.** On approval Companies announces `companies.settlement.approved`. If Invoices is on, Invoicing listens and makes a draft (a bill when the balance is positive, an invoice when negative) from Companies' `invoicing.line-owner` contribution, and Companies posts nothing itself: the posting is made at issue through that contribution's `entries`. If Invoices is off, Companies posts at approval (M1). The posting's idempotency key is the settlement id, so it is made once.

**S9.** A settlement becomes `paid` on `invoicing.invoice.paid`, or when payments recorded against it (Invoices off) sum to its balance. A zero balance is `paid` on approval. The engagement then moves to `settled`.

**S10.** A paid or approved settlement found wrong is corrected by a new version whose posting reverses the old one's and posts the new (Finance's `reversePosting`), never by editing; Invoices credits its document on `invoicing.invoice.credited`.

## Money

**M1.** With Invoices off, approval posts once, kind `recognition`: company share and top-up Dr `companies.company-share` / Cr `companies.payable`; hire fee and charges Dr `companies.receivable` / Cr `companies.hire-income` (or the contributor's own account for a charge); deposit kept Dr `companies.deposits-held` / Cr `companies.other-income`. Each entry carries the production id.

**M2.** A deposit is taken through Payments as an intent owned by Companies (`payments.settlement` contribution), by any method the theatre enables. Settling it posts Dr clearing (Payments) / Cr `companies.deposits-held`. A deposit is never on an invoice; an invoice may show "deposit held" as a note.

**M3.** Returning a deposit is a Payments refund of that intent, approved under Payments' refund rules; keeping part of it is a `deposit-kept` settlement line, and the rest is refunded.

**M4.** With Invoices off, a payment out recorded against a settlement posts Dr `companies.payable` / Cr `companies.paid-out`; a payment in taken through Payments posts through its settlement handler against `companies.receivable`. Recording more than the balance refuses, quoting both figures (decision 0004's pattern).

**M5.** Every money screen sends the total it expects; a mismatch refuses quoting both figures.
