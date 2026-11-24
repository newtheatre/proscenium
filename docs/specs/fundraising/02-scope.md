# 1. Scope

Fundraising owns gifts of money to the theatre and everything that must be kept about them; it owns no ticket, no membership and no organisation. It requires `payments` and `finance` (all money moves through them) and uses `box-office`, `membership-fees`, `communications`, `companies` and `invoicing` when they are switched on.

## In scope

| Area | What it covers | Release |
| --- | --- | --- |
| Funds | Where a gift goes: a general fund, a building appeal, a bursary. Restricted or unrestricted; one default | First |
| Donations on their own | A public donate page: amount, fund or campaign, Gift Aid, a message, acknowledgement; paid by card online | First |
| Donations at checkout | An optional extra in the box office basket (and the membership fee payment): presets, own amount, round up | First |
| Donations at the till | A Donation panel in the combined till; Gift Aid completed afterwards by an emailed link | First |
| Gifts recorded by staff | A cheque, a bank transfer or a gift made elsewhere, entered with how it arrived | First |
| Gift Aid declarations | Single or enduring, online or on paper; cancelled by the donor at any time from My account | First |
| Gift Aid claims | Gathering eligible donations, aggregating small ones, writing HMRC's schedule, recording submission and payment, adjustments for refunds | First |
| Campaigns | An appeal with a target, dates, a public page and an optional public total, tied to a fund and optionally a production | First |
| Acknowledgement | Thank-you email with the Gift Aid statement; an opt-in name list per campaign | First |
| Sponsorships | An organisation's support for a season, production or the theatre: amount, term, benefits delivered, renewal reminders, invoice | First |
| Figures | Contributions to `core.measure` for Reports | First |
| Regular giving | Monthly or yearly gifts by card or Direct Debit | Later, needs a recurring capability in Payments (question 5) |
| Gift Aid Small Donations Scheme | Bucket collections and small contactless gifts claimed without declarations | First release (question 9, decided) |
| Collections for another charity | An off-ledger record of cash collected for a charity the theatre supports and handed straight to it | First release (question 11, decided) |
| Grant applications | Applications to trusts, foundations, the Arts Council or the union: deadlines, decisions, payments received and the reports owed afterwards | First release (question 10, decided) |
| Donor benefit tracking | The value of benefits a donor receives, checked against HMRC's limits | Later; first release refuses Gift Aid on any gift with a benefit |
| Giving as a requirement | "Has given at least £X in the last 12 months" as a `core.requirement` source, for priority booking | Later |
| Annual giving statement | A donor's gifts and Gift Aid for a tax year, downloadable | Later |

## Out of scope, and who owns it

| Not here | Owner |
| --- | --- |
| Gift vouchers | Payments and core's account credits, as later stories there (map doc, "Combined") |
| Friends and patrons schemes, their fees and benefits | Membership (supporters' schemes) and Membership fees. Fundraising adds nothing to a scheme in the first release |
| Pay-what-you-can and suggested-donation tickets | Box office ticket types. A ticket is never a donation |
| The organisation behind a sponsorship, its contacts and merges | Companies (`companies.company`) |
| Invoicing a sponsor, and the receivable | Invoices and exports (`invoicing`) |
| Accounting exports of donation income | Invoices and exports reads the ledger; Fundraising writes HMRC's schedule only |
| Consent to receive appeals, mailing lists and sending | Communications. Fundraising contributes an audience source of donors and never holds marketing consent |
| Funding the theatre gives to others (festival acts, bursaries paid out) | Budgets and claims |
| Raffles, lotteries, auctions, crowdfunding rewards | Not this platform: each is regulated differently and none was asked for |
| Claiming Gift Aid on ticket sales or membership fees | Never. HMRC does not treat admission as a gift, and a membership fee qualifies only in narrow cases (part 3, rule G3) |

## Assumptions about other modules

- **Payments** settles a payment with several owners, one part each, through `payments.settlement` (built). It gains a point `payments.checkout-extra` and a service for money received by bank transfer, both asked for in part 4.
- **Finance** creates Fundraising's accounts from `finance.system-account`, including one account per fund made with `ensureScopedAccount` (built).
- **Box office** and **Membership fees** call `payments.checkout-extra` when they build an online payment, and show the extra in the basket and on the confirmation.
- **Companies** contributes `core.record-resolver` and a picker for `companies.company`, and announces `companies.company.merged` (agreed with the Companies thread, 23 November 2026).
- **Invoices and exports** offers `invoicing.raise` and the code point `invoicing.line-owner`, and announces `invoicing.invoice.paid` and `invoicing.invoice.credited` (agreed with that thread, 23 November 2026).
- **Reports** reads figures through the kit point `core.measure` (contract from the Reports thread, 23 November 2026).

## Principles

1. **A gift is never a purchase.** A donation is always optional, always separate from what it rides beside, and never changes the price of a ticket or what the buyer can book. This is both HMRC's rule and plain fairness.
2. **Fundraising owns its money from the first penny.** Every donation is its own payment part and its own ledger posting to a fund, so a show's statement never counts gifts as ticket income.
3. **The Gift Aid record is the audit trail.** Declarations are never edited; an ending is its own row. What was claimed, on which declaration, in which claim, is answerable for six years.
4. **A theatre that is not a charity sees no Gift Aid.** Every Gift Aid word, box and screen is hidden until the theatre switches it on and gives its HMRC reference.
5. **Donors choose how they are named.** Nobody is listed publicly without ticking a box; "Anonymous" is always an option.
6. **Nothing here is NNT-specific.** NNT is a students' union society and may never switch the module on; it is written for a charity theatre first.

## Glossary

Words this module owns. Words owned elsewhere keep their meaning from the shared glossary.

| Term | Meaning |
| --- | --- |
| Gift | Money given with nothing bought in return. The plain word used in the interface |
| Donation | One gift, recorded: who, how much, when, to which fund. The record's name in code and on staff screens |
| Donor | The person or organisation a donation is from. A person is an account or an email address; there is no donor table |
| Fund | Where a donation's money is held and reported: unrestricted (the general fund) or restricted to a purpose |
| Restricted | A fund whose money may be spent only on its stated purpose, as charity law requires |
| Campaign | A time-limited appeal for a fund, with a target and its own page |
| Target | The amount a campaign hopes to raise |
| Raised | The total of a campaign's received donations, less refunds, plus Gift Aid where the setting says so |
| Channel | How a donation arrived: online, checkout, till, recorded (by staff) and, later, regular |
| Checkout extra | Something optional offered in another module's online payment. A donation is the first |
| Round up | A checkout extra amount that brings the basket to the next whole pound or five pounds |
| Gift Aid | The UK scheme under which a charity reclaims basic-rate tax on a gift from a UK taxpayer |
| Declaration | A donor's statement that Gift Aid should apply. Always "Gift Aid declaration" on screen |
| Single declaration | Covers one donation only |
| Enduring declaration | Covers the donor's gifts from a date onwards and, if they chose, those of the four years before the tax year it was made in |
| Ending | The row that stops an enduring declaration from a date. The donor says "cancel"; the record says "ended" |
| Claim | One request to HMRC for Gift Aid, made of claim lines and sent as one schedule |
| Claim line | One donation in a claim, or a negative adjustment for one refunded after it was claimed |
| Aggregated line | Several donations of £20 or less shown on the schedule as one total, as HMRC allows |
| Schedule | The spreadsheet HMRC's Charities Online accepts, built by Fundraising and uploaded by a person |
| Benefit | Anything a donor or sponsor receives because of a gift: a programme credit, a ticket, a logo |
| Sponsorship | An organisation's paid support for a season, a production or the theatre, with benefits, for a term |
| Sponsor | The organisation behind a sponsorship: a Companies company, or a name where Companies is off |
| Acknowledgement | How a donor wishes to be named publicly, or "Anonymous" |

"Member" is never used for a donor or a patron. "Patron" is the name a theatre may give a Membership supporters' scheme; Fundraising does not define it. "Supporter" keeps Membership's meaning.
