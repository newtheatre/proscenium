# 7. Stories

Fifty-three stories, FR-01 to FR-53: 4 gate, 42 in the first release, 7 later. FR is a new prefix, not used by any specification on `next`. Fundraising is roadmap phase 6 (wider adoption), so "first release" means the module's own first release. The gate stories are the seams other modules wait on and can be built before the rest.

## Gate

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-01 | As a theatre switching Fundraising on, I have a default fund and its ledger accounts | Switching on creates the module's system accounts; creating a fund makes its scoped `donations` and `gift-aid` accounts in the same unit; one default fund exists | Finance `ensureScopedAccount` |
| FR-02 | As Payments, I can settle, refund and release a donation part | `payments.settlement` handler: settle receives and posts M1; refunded reverses; release marks abandoned; describe names it; all idempotent | FR-01; Payments settlement |
| FR-03 | As Box office, I can offer another module's extra in my online payment | Payments declares `payments.checkout-extra`; an owner calling `collect` with an extra gets a second part; with no contributor nothing changes | Payments; agreed in Integration |
| FR-04 | As Fundraising, I can record money that arrived in the bank without a provider | Payments' `receiveTransfer` posts + bank and the owner's entries in one posting; the own-accounts trigger holds | Payments |

FR-03 unblocks FR-14 and FR-38; FR-04 unblocks FR-16, FR-27, FR-32, FR-39 and FR-50.

## First release

### Setting up

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-05 | As a treasurer, I set up funds in the Fundraising settings, guided by a setup step | Funds created, edited, ordered, archived and restored; restricted needs a purpose and cannot change after a gift; the default cannot be archived | FR-01; core.setup-step |
| FR-06 | As a treasurer, I change Fundraising's settings and they are checked together | Each setting in part 6 saves; Gift Aid on is refused without charity name, HMRC reference, year end and GBP; presets outside the limits are refused | Kit settings |

### Giving

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-07 | As anyone, I give to the theatre on its Give page, signed in or as a guest | Presets and own amount within limits; fund choice outside a campaign; acknowledgement and message; card payment through Payments; the donation is pending, then received | FR-02 |
| FR-08 | As a donor, I see a thank-you page and get a thanks email | Reference, amount, fund, Gift Aid status; email sent once by job; none for an anonymous gift with no email | FR-07; core notifications |
| FR-09 | As a visitor, I find how to support the theatre on one page | `/support` lists open campaigns, offered funds and named sponsors, with the theatre's own content above | FR-07 |
| FR-10 | As a fundraising lead, I create, publish and close a campaign | States of part 3; slug unique; opens and closes on time by task; a closed page says so and offers the fund | FR-05 |
| FR-11 | As a visitor, I see a campaign's progress and who has given | Raised per K1; target bar only with a target and show total; names per K3, with a band or amount only where the campaign and the donor both allow it | FR-10 |
| FR-12 | As a fundraising lead, I am told when a campaign reaches its target | K2: once only; event announced | FR-11 |
| FR-13 | As a production's marketing lead, I tie a campaign to a show and it appears on the show's page | Production record tab lists its campaigns and sponsors; public component shows open campaigns | FR-10; core.public-component |
| FR-14 | As a buyer, I may add a gift at online checkout | Box office's basket shows the extra; nothing preselected; round up; adding and removing changes nothing else (D2); one intent, two parts; confirmation and email show the gift line | FR-03 |
| FR-15 | As a seller, I take a gift at the till, alone or with other items | Donation panel in the combined till and live mode; optional email sends thanks with the Add Gift Aid link | FR-02; payments.desk-basket |
| FR-16 | As a treasurer, I record a gift that came by cheque or bank transfer | Recorded gift with how received and date; posted through FR-04; optional paper declaration with upload | FR-04 |
| FR-17 | As fundraising staff, I list, search and open donations, and see a person's giving on their record | List and record pages; search by reference and donor; Giving tab on an account | FR-07 |
| FR-18 | As a treasurer, I refund a gift without touching the tickets it rode with | Refund through Payments' flow and approval; ticket refunds never refund the gift (D6) | FR-02 |
| FR-19 | As a treasurer, I move a gift to the right fund or campaign | D7: transfer posting and row change in one unit, with a reason; leaving a restricted fund asks for confirmation | FR-05 |

### Gift Aid

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-20 | As a UK taxpayer giving online or at checkout, I add Gift Aid | Unticked box; name, house and postcode; this gift only or this and past four years and future; the theatre's wording shown and its version stored; confirmation email | FR-07, FR-14; FR-06 |
| FR-21 | As fundraising staff, I see whether each gift can be claimed, and why not | Status and reason per G1 to G5, recomputed on receipt, on declaring and on ending | FR-20 |
| FR-22 | As a donor who gave at the till or as a guest, I add Gift Aid afterwards from a link | Single-use token link; declaration made; eligible gifts covered; the link cannot be used twice | FR-15, FR-20 |
| FR-23 | As a donor, I see my giving and cancel my declaration in My account | Your giving section; cancel from today or later; past gifts stay covered; ended email | FR-20 |
| FR-24 | As a Gift Aid officer, I enter a paper declaration and end or supersede one | Paper form with upload; supersede on new address; end with reason; never edits a row (G7) | FR-20 |
| FR-25 | As a Gift Aid officer, I prepare a claim | One live claim at a time; gathers eligible gifts up to a date, oldest first, to 1,000 schedule lines; refresh; make ready copies the rate | FR-21 |
| FR-26 | As a Gift Aid officer, I download the schedule for Charities Online | HMRC's columns and formats; aggregation of £20 and under to £1,000 lines within a period; audited read; rate-limited; never stored | FR-25 |
| FR-27 | As a treasurer, I record that a claim was submitted and then paid | HMRC reference and date; second person rule; M2 posting on submission, M3 on payment with any difference posted | FR-26; FR-04 |
| FR-28 | As a Gift Aid officer, a gift refunded after it was claimed is adjusted in the next claim | Adjustment line; status adjusted; shown in HMRC's adjustment box | FR-27; FR-18 |
| FR-29 | As a treasurer, I am warned before eligible gifts pass their claim deadline | Health check and weekly notification per C6 | FR-21 |

### Sponsorships

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-30 | As a sponsorship officer, I record a sponsorship from approach to end | States of part 3 by hand and by task; renewal reminder; renew makes a new linked row | Companies picker, or a typed name |
| FR-31 | As a sponsorship officer, I track the benefits we owe | Benefits checklist with due dates; overdue shown on the overview | FR-30 |
| FR-32 | As a treasurer, an agreed sponsorship is invoiced and its payment recorded | `fundraising.sponsorship.agreed` announced; `invoicing.line-owner` gives lines and entries; paid and credited heard; without Invoices, payment recorded by FR-04 | FR-30; Invoices and exports |
| FR-33 | As a visitor, I see the theatre's sponsors; as staff, I see a company's sponsorships on its page | Supporters page and production page show active acknowledged sponsors with logo and link; record tab on the company | FR-30; Companies |

### Across modules

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-34 | As a committee, I see fundraising figures in Reports | The `core.measure` contributions of part 4, aggregates only, with their abilities | core.measure |
| FR-35 | As a fundraising lead, I can send an appeal to past donors who agreed to hear from us | Audience source for Communications, filterable by fund, campaign and date; consent applied by Communications | Communications |
| FR-36 | As a donor who asks to be forgotten, my details go but the theatre's accounts and HMRC records stay | E1 to E3: anonymise; Gift Aid hold shown with its end date; sweep after retention; merges alias; company merges repoint | Identity erasure; core.erasure-hold |

### Small donations

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-39 | As a treasurer, I record a counted collection and bank it | Two counters, never the same person (SD3); notes over the limit excluded; banking makes the donations through FR-04 | FR-04, FR-47 |
| FR-45 | As a seller, a small cash or contactless till gift with no Gift Aid counts for the Small Donations Scheme | SD2: eligible only at or under the limit, cash or contactless, no declaration; a later declaration moves it to Gift Aid, never both | FR-15, FR-47; Payments reports the method |
| FR-46 | As a Gift Aid officer, my claim carries the year's small donations top-up | SD5's three limits including community buildings; SD6 one tax year in the same claim; figures shown for Charities Online; M8 on submission | FR-25, FR-39, FR-45 |
| FR-47 | As a treasurer, I switch on the Small Donations Scheme | SD1: refused while Gift Aid is off; penalty confirmation audited; the settings of part 6 | FR-06 |

### Grants

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-49 | As a fundraising lead, I record a grant application from planned to the funder's decision | States of part 3 and GR1 to GR4; funder from Companies or typed; files attached; deadline reminder once | FR-05; Companies picker |
| FR-50 | As a treasurer, I record payments from a funder against an award | GR5 and M7 through FR-04; more than the award asks for confirmation; closing short needs a reason | FR-49, FR-04 |
| FR-51 | As a fundraising lead, I track the reports a funder is owed | GR6: reports added on award; reminders; overdue on the overview and in a health check; sent or waived | FR-49 |
| FR-52 | As a committee, I see grants in Reports and on a production | Grant figures of part 4; record tab on the production; `fundraising.grant.awarded` announced for Budgets | FR-49; core.measure |
| FR-53 | As a front of house manager, I record cash we collected for another charity and when we handed it over | SD8: charity, date, amount, two different counters; no ledger entry, donation, total, measure or claim line; hand-over date fixes it; held past `fundraising.collections.hand-over-notice` raises a health check; works with Gift Aid off | FR-01; core.health |

### Donor acknowledgement

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FR-48 | As a donor, I choose whether my amount shows beside my name | A separate unticked box on the Give page and checkout card, shown only when the campaign lists amounts or bands; withdrawn from Your giving (K3) | FR-07, FR-11, FR-23 |

## Later

| Id | Story | Waits for |
| --- | --- | --- |
| FR-37 | As a supporter, I give monthly or yearly by card or Direct Debit, and can pause or stop | A recurring capability in Payments (question 5) |
| FR-38 | As someone joining a supporters' scheme, I may add a gift when paying the fee | FR-03 in Membership fees' pay page |
| FR-40 | As a donor, I download a statement of my gifts and Gift Aid for a tax year | FR-23 |
| FR-41 | As a Gift Aid officer, a gift with a benefit is claimed when the benefit is within HMRC's limits | Benefit values per gift; the relevant value and £2,500 aggregate tests as settings |
| FR-42 | As box office staff, I take a Gift Aid declaration by phone or in person | G10: written record sent, 30-day cancellation (question 7) |
| FR-43 | As a theatre, I give priority booking to people who have given at least £X in the last year | `core.requirement` source `fundraising` |
| FR-44 | As a sponsorship officer, a ticket benefit raises Box office's complimentary request | Box office comp requests with reason sponsor |
