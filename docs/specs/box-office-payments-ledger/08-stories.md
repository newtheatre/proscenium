# 7. Stories

## How to read this part

Each story has an id, who it is for, and acceptance criteria written so a test can assert them. "First" means the first release of the box office (roadmap phase 3). "Later" means designed here and built after. "Seating" means the allocated-seating phase.

The roadmap's gate for phase 3 is: a paid booking, a refund and a period close reconcile to the penny, and a full house sells its last seat once. The stories marked **Gate** are the ones that gate rests on.

Counts: 71 stories. 63 are in the first release (17 of them Gate; two with a part held for later, PAY-06 and FIN-06), 5 are later (BO-35, BO-64, BO-65, BO-66, FIN-07) and 3 come with allocated seating. Buyers cancelling and exchanging their own tickets (part of BO-22, and BO-55) ship switched off, so they are not Gate stories: the gate is passed with staff cancellation, and self-service is tested behind its setting. Part 9 lists which first-release stories would be cut first if the scope has to shrink.

## Putting a show on sale

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-01 | As a box-office manager I set up a performance for sale | Given a scheduled performance, I can add bands with capacities, choose prices per ticket type, and set an on-sale time. The checklist names anything missing. Going on sale is refused with the reason while a band has no price or a paid price has no way to pay | First |
| BO-02 | As a box-office manager I copy the set-up from another performance | Bands, capacities, prices and limits are copied; sold tickets and holds are not | First |
| BO-03 | As a box-office manager I change a price after going on sale | New baskets get the new price. Existing baskets and orders keep the price they were given. The price history shows who changed it and when | First |
| BO-04 | As a box-office manager I raise or cut capacity | Raising above the space's own capacity needs `box-office.performance.exceed-venue` and records who confirmed. Cutting below tickets sold is refused, stating how many are sold | First |
| BO-05 | As a box-office manager I pause and resume sales | While paused, new baskets are refused with "sales are paused"; baskets already open can still be paid | First |
| BO-06 | As a visitor I see the right booking action on a show page | The page shows Book, On sale from (with the time), Sold out with the waiting list, or Sales closed, matching the performance's state within one minute of a change | First |

## Buying online

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-10 | As a buyer I book tickets without an account | From a show page I reach a confirmed order giving only name and email. No screen asks me to sign in or mentions membership | First. Gate |
| BO-11 | As a buyer my seats are held while I pay | After "Hold tickets" the seats cannot be sold to anyone else until my countdown ends. The countdown is visible on every step. Changing my basket does not restart it | First |
| BO-12 | As a buyer I am never charged for seats I did not get | If payment succeeds I always have confirmed tickets, or I am told the booking failed and a full refund has been started. There is no third outcome | First. Gate |
| BO-13 | As one of many buyers for the last seat, exactly one of us gets it | With N buyers pressing at once for 1 remaining seat, 1 order holds it and N-1 are told it has gone. The pool's count of live claims never exceeds capacity | First. Gate |
| BO-14 | As a buyer in a group, we sit together or not at all | A request for 4 when 3 remain takes none and says 3 remain | First |
| BO-15 | As a buyer I see the full price before I commit | The booking fee appears as a line as soon as there is a basket. The amount on the pay button equals the amount charged. A server total that differs from the screen's refuses, showing both | First |
| BO-16 | As a buyer I receive my tickets | Within a minute of confirmation an email arrives with one QR code per ticket and a link to the order that needs no sign-in | First |
| BO-17 | As a buyer I use a promo code | A valid code changes the price on eligible tickets and shows the saving. An expired, used-up or inapplicable code says which. The last use of a limited code is given once under concurrent use | First |
| BO-18 | As a wheelchair user I book a space and a free companion ticket | Wheelchair spaces are a band with their own capacity. Where the venue removes seats to make a space, booking one also takes the set number of seats from the seating band, all or none. If I transfer to an ordinary seat I book that seat and no space is used. A companion ticket needs another ticket in the same order, and with the access scheme on I can take as many as my allowance and no more | First |
| BO-19 | As a buyer on the access scheme the theatre knows my access needs for this visit | If I am on the theatre's access scheme and signed in, my needs are carried onto the booking and I am told so; otherwise I book as anyone does and am pointed to the application. The copy on the order does not change if my record does. It is stored encrypted, shown only to holders of `box-office.order.view-access-note`, flagged (not shown) on the door screen, and cleared on erasure | First |
| BO-20 | As a member I get my member price without doing anything special | Signed in, a ticket type whose requirement I meet is offered at once. Otherwise I see the type with one field for my membership reference, worded by whoever provides the requirement; what I type is checked and never stored. Each further member ticket asks for its own reference, and one membership buys one ticket for a performance. If the provider is switched off the type is withheld. Box office code never names membership | First |
| BO-21 | As a buyer I come back to a payment that is still being checked | If the provider has not answered when I return, the screen waits, then tells me I will be emailed. My seats stay held until there is an answer | First |
| BO-22 | As a buyer I manage my booking | From the email link I see my tickets and can have them sent again. If the theatre allows it and the cut-off has not passed I can cancel for a refund less the stated fee | First; cancelling is off by default |
| BO-23 | As a signed-in buyer I see all my tickets | "My tickets" lists upcoming and past orders for my account, including guest orders made with my verified email | First |
| BO-24 | As a buyer running out of time I ask for a little longer | When my countdown is nearly over I am offered more time. Accepting adds `box-office.baskets.extend-by` to the hold and to every claim in it in one batch, once per basket. With the setting at zero the offer is not shown. A basket that has expired holds nothing and says so | First |

## Reserving now and paying on arrival

This is how the first theatre sells, so all seven are Gate stories. The rules are in part 3.

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| R-1 | As a member of the audience I reserve tickets online without paying, so I can book weeks ahead and pay when I arrive | A reservation claims the seats, emails a reference, a desk code, the amount due and a cancel link, and posts nothing to the ledger | First. Gate |
| R-2 | As a member of the audience I cancel or reduce my reservation from the email, so the seats go to someone else | The link releases the seats at once with no sign-in and no refund step | First. Gate |
| R-3 | As a seller I find a reservation by code, name or reference, so the queue moves | The desk screen opens the order from a scan, a typed reference or desk code, or three typed letters of a name. Search by name goes through Identity's findAccounts (part 4) and follows it; reference and desk code ship first | First. Gate |
| R-4 | As a seller I adjust a reservation before taking payment, so I charge for who actually came | Removing a ticket, adding one, or changing its type updates the amount due and the claims in one step | First. Gate |
| R-5 | As a seller I take payment on the reader or in cash and admit in one press, so nobody is handled twice | Success confirms the order, issues the tickets, marks them admitted and posts the sale, in one batch; failure leaves the reservation intact | First. Gate |
| R-6 | As a box-office manager I have unclaimed reservations released before the start, so empty seats can be sold on the door | The task `box-office.release-reservations` releases at the time set in `box-office.reservations.release-before`, skips any order marked keep or with a payment in flight, and offers the seats to the waiting list. With the setting unset, staff release by hand | First. Gate |
| R-7 | As a box-office manager I set limits on reservations and require a confirmed email address, so seats are not blocked by fake or greedy bookings | The limits and the confirmation are enforced where the reservation is written | First. Gate |

## Selling at the desk and by phone

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-30 | As a seller I sell tickets and take a card payment on the reader | After choosing tickets I press the reader's button; the screen waits; on approval the order is confirmed and tickets can be emailed or shown. Nothing is recorded as paid before the reader answers | First. **Gate** |
| BO-31 | As a seller I take cash | I enter the amount handed over, see the change, and confirm. The sale is in my session's expected cash | First |
| BO-32 | As a seller I am told the truth when the reader does not answer | After the wait the screen says there was no answer. I can check again, cancel, or state the reader's own result, which is recorded under my name. The seats stay held meanwhile | First |
| BO-33 | As a seller I find an order for someone at the desk | Searching by name, email or reference finds it; I can resend or show the tickets. Name and email go through Identity's findAccounts (part 4); reference ships first | First |
| BO-34 | As a seller I take a booking by phone | A phone order is confirmed by a payment taken at the desk, or reserved for the person I name as an ordinary reservation: emailed to them, under the per-person limit, released unpaid at the performance's release time, and carrying what a pass used on it still owes (the seller-set time is cut: 10-questions-for-matt, cut 5) | First |
| BO-35 | As a seller I split a payment between cash and card | The sale completes when the parts add up to the total. If the buyer abandons it part-paid, the paid part is refunded | Later |
| BO-36 | As a box-office manager I hold seats back | I hold a number of seats with a label and an optional end date. They are not for sale. I can sell from the hold or release it | First |

## At the door

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-40 | As a steward I scan a ticket and know at once | A valid ticket shows Admitted. A second scan shows Already in, with the time and door. A ticket for another performance, a cancelled ticket and a code that is not ours each say so. A desk code or a reservation reference says Not paid, send to the desk; once paid, it admits everyone on the booking not yet in. Each result is shown afresh (it springs in, the device vibrates where it can, and an admission clears after a few seconds), so consecutive tickets are never mistaken for one | First. Gate |
| BO-41 | As a steward I keep working when the wifi drops | With the offline data loaded, scanning works offline and shows that it is offline. Queued scans are sent on reconnection, exactly once each | First |
| BO-42 | As a steward I admit someone by name | The door list finds a buyer by name, through Identity's findAccounts (part 4), and admits one or all of their tickets | First |
| BO-43 | As a front-of-house manager I see how many are in | Sold, admitted and still to come, updated within a few seconds while online | First |
| BO-44 | As a steward on shift I can scan tonight without being given a role | With Front of house on and the fact mapped, my confirmed shift lets me scan tonight's performance only | First |
| BO-45 | As a steward I am told when a ticket's requirement is no longer met | A ticket sold on a requirement is checked again at the scan. Not met shows the provider's own words and does not admit; I send the person to the desk. A holder of `box-office.ticket-type.override-requirement` may admit anyway with a reason, never for their own ticket. For a ticket bought by reference the screen asks to see the card and, online, shows whose name it should carry; the name is never stored. If the provider cannot be reached, or I am offline, the ticket is admitted and listed as unchecked | First |

## Changing and cancelling

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-50 | As a box-office manager I cancel tickets and refund them | I choose lines, choose full refund, refund less fee, or none. The seats return to sale, the tickets are void at the door, and the refund goes back by the method that paid | First. Gate |
| BO-51 | As a second person I approve a refund | A refund above the self-approval limit recorded on the request waits for someone other than the requester; I cannot approve my own above that limit. Declining needs a reason from the theatre's list and moves no money. Two approvals of overlapping refunds can never exceed what was paid | First. Gate |
| BO-52 | As a box-office manager I handle a cancelled performance | The core refuses to cancel a performance with tickets until I record a decision on the Bulk cancellation screen, which shows how many tickets and how much money are affected: refund everyone, offer an exchange, or keep the orders. When the core then cancels, my decision runs. With refund, every order is cancelled and refunded; a failure on one order is listed and does not stop the rest. Every ticket holder is told | First |
| BO-53 | As a box-office manager I handle a rescheduled or moved performance | The same decision is recorded before the core will change the time (rescheduled) or the space (moved). Ticket holders are told the new time or the new place. Tickets stay valid unless I chose to refund, and those who cannot attend can be refunded. After a move the capacity is read again and the on-sale checklist flags any pool that no longer fits | First |
| BO-54 | As a seller I exchange tickets to another performance | The old seats are released only if the new ones are secured. A price difference is collected or refunded | First |
| BO-55 | As a buyer I exchange my own tickets | As BO-54, online, within the cut-off, with the stated fee | First, off by default |

## Waiting list, complimentary tickets and passes

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-60 | As a visitor I join the waiting list for a sold-out show | I can join only for a party the house cannot seat. I get an email confirming my place | First |
| BO-61 | As someone waiting I am offered seats when they come back | When seats return, the earliest party that fits is emailed an offer, and the seats are held for them until it lapses. A lapsed offer goes to the next party | First |
| BO-62 | As a production team member I request complimentary tickets | I state how many, for whom and why. I see the decision. I cannot approve my own request | First |
| BO-63 | As a box-office manager I approve and issue complimentary tickets | Approval within the cap issues zero-price tickets that scan like any other and are counted separately in reports | First |
| BO-64 | As a buyer I buy and use a season pass | A pass is sold as an order line, and exchanged for tickets up to its allowance; the last use is given once | Later |
| BO-65 | As a buyer I see a show's age guidance and staging effects before I pay | The basket shows, for each performance in it, the minimum age and the staging effects from Core's guidanceFor(productionId, performanceId), in Core's words. Where the age is a restriction and not guidance, the order cannot be paid or reserved until the buyer has acknowledged it, and the order keeps that they did and when. A seller at the desk sees the same and acknowledges on the buyer's behalf | Later (with Core's content warnings slice) |
| BO-66 | As a booker I am told when a warning is added after I booked | When core.production.updated carries guidanceAdded (a staging effect or a depicted warning that was not there before), everyone holding a live ticket or reservation for an affected performance that has not yet happened is sent one message naming what was added, with the order's link and the refund terms that apply. A warning removed sends nothing, and the same addition is never sent twice to one order | Later (with Core's content warnings slice) |

## Allocated seating

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| BO-70 | As a box-office manager I draw and publish a seating plan | A published plan is frozen; changes are made on a copy. A performance on sale keeps the plan it started with | Seating |
| BO-71 | As a buyer I choose my seats on a map | A seat I select is mine alone while my basket lasts. Two buyers pressing the same seat: one gets it | Seating |
| BO-72 | As a box-office manager I take a seat off sale | It is a staff hold on that seat, shown on the map, and counts against capacity | Seating |

## Payments

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| PAY-01 | As a treasurer I connect a payment provider | Guided setup names the secrets or connection needed, checks them, and offers a test payment in test mode. A provider with a missing secret is unavailable and the health screen says which secret | First |
| PAY-02 | As a treasurer I pair a card reader | A reader is paired with a provider account and named; it appears as a button at the desk | First |
| PAY-03 | As a seller I open and cash up my till session | Opening asks for a float. Closing asks for the cash counted and shows the difference from expected; a difference needs a reason, and above the limit a second person | First |
| PAY-04 | As a treasurer I resolve a payment with no answer | "Needs attention" lists it with how long it has waited. The system keeps asking the provider. I can answer it from the provider's dashboard, recorded under my name | First |
| PAY-05 | As the system I am not fooled by a repeated or forged webhook | A repeated event changes nothing. An event with a bad signature is stored and never acted on. Events out of order produce the same final state | First. Gate |
| PAY-06 | As a treasurer I see what each provider charged | Where the provider reports fees, each is posted against the payment; otherwise fees are entered by hand per payout | First: by hand. Later: reported |
| PAY-07 | As a seller I take one card payment for tickets and items from another module, so the one reader serves the whole sale | The reader takes one total; every part settles in the same batch or none does; the ledger credits each owner's account; a refund cannot exceed its own part. Tested with a stand-in second owner | First |

## Finance

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| FIN-01 | As a treasurer I trust that every sale and refund is in the ledger once | For any period, sales less refunds in the box office equal the ledger's income and deferred income movements, to the penny. Replaying any job or webhook posts nothing twice | First. **Gate** |
| FIN-02 | As a treasurer I close a period | The close screen lists what blocks it. Once closed, nothing can be posted into it; late facts post into the next open period with their true date | First. **Gate** |
| FIN-03 | As a treasurer I correct a mistake without editing history | A correction is a reversing posting plus a new one, both linked to the original | First |
| FIN-04 | As a producer I see my production's box office statement | Income, booking fees charged to buyers and refunds for one production, visible to someone granted the ability on that production only. What a payment provider charged the theatre is not on the statement in the first release, since those charges are entered by hand per payout and belong to no production, and the screen says so. When providers' charges are reported per payment (the later part of PAY-06), each is shared across the productions in that payment in proportion to their income entries and tagged, so the statement can show them | First |
| FIN-05 | As a treasurer I export the ledger | A CSV of postings and entries for a date range, with account codes | First |
| FIN-06 | As a treasurer I reconcile card money against payouts | The clearing account's balance equals payouts not yet received. Line-by-line matching of payouts to payments | First: balance. Later: matching |
| FIN-07 | As a VAT-registered theatre I record tax on sales | Tax codes on entries, a tax report per period | Later |

## Not stories of these modules

| Wanted | Where it lives |
| --- | --- |
| Bar and merchandise sales | The Bar module, through `payments.desk-basket` and `payments.settlement` |
| Donations with Gift Aid | Later; a donation line exists now, the tax-relief record does not |
| Memberships and their fees | The Membership module, which takes payment through `collect` and `payments.settlement` |
| Expenses, budgets, invoices to hirers | Out of scope of this workstream; Finance here is the ledger only |
| Marketing emails to bookers | Communications. Box office contributes audience sources of account ids; Communications holds the consent |
| Embeddable booking widget, wallet tickets, agent and promoter allocations | Not scheduled. They are in the design paper's module catalogue and have no stories yet |
