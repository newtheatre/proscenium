# 4. Interface to other modules

Fundraising talks to others only through Payments' and Finance's services, core points and events. It declares no point of its own in the first release and needs two things it does not yet have: a checkout-extra point and a bank receipt service, both from Payments.

## Dependencies and records

| Field | Value |
| --- | --- |
| `id` | `fundraising` |
| `requires` | `payments`, `finance` |
| `uses` | `box-office`, `membership-fees`, `communications`, `companies`, `invoicing` |
| `stability` | `experimental` until FR-01 to FR-30 ship |
| Record types | `fundraising.fund`, `fundraising.campaign`, `fundraising.donation`, `fundraising.declaration`, `fundraising.claim`, `fundraising.sponsorship` (parent `companies.company`, optional) |
| Facts | None in the first release. Later: `fundraising.donor-within` as a requirement source, not a fact (FR-43) |
| Secrets | None |

Companies is reached only through core points and its event, as the Companies thread advised, so Fundraising stays a `uses` and never calls Companies' services.

## Services Fundraising exports

Named exports of `layers/fundraising/server/services.ts`. No first- or second-round module needs them; they are for Reports, Festival and later modules.

| Service | Returns or does |
| --- | --- |
| `donationsOf(account)` | A person's donations, newest first, for My account and the account record tab. Reads only |
| `campaignSummary(campaignId)` | Title, raised, target, open or closed, link. Reads only; what a production page or a festival page shows |
| `openCampaignsFor({ production?, season? })` | Open campaigns tied to a production or season, for a public page section. Reads only |
| `recordGift(unit, input)` | Adds a recorded gift (channel `recorded`) to the caller's unit: a later module such as Companies' settlement might pass on a gift made through it. Needs `fundraising.donation.record` |

## Points Fundraising contributes to

| Point | Owner | What Fundraising adds |
| --- | --- | --- |
| `payments.settlement` | Payments | One handler for every donation part: `settle` receives the donation and returns M1's entry; `refunded` returns the reversing entry and adds an adjustment if the gift was claimed; `release` marks it abandoned; `describe` gives its reference and donor; `receiptLink` gives the Gift Aid link for a till gift |
| `payments.desk-basket` | Payments | The Donation panel in the combined till: amount (presets or typed), fund, an optional email for the thanks and the Gift Aid link. Ability `fundraising.donation.take` |
| `payments.checkout-extra` (new, asked of Payments below) | Payments | The donation offer at online checkout: presets, own amount, round up, and in Gift Aid theatres the declaration box |
| `finance.system-account` | Finance | `donations` (income, scoped by fund), `gift-aid` (income, scoped by fund), `gift-aid-receivable` (asset), `sponsorship-income` (income). A fund's scoped accounts are made with `ensureScopedAccount` when the fund is |
| `finance.period-close-check` | Finance | A period cannot close while a recorded gift in it is unposted, or a claim is submitted with no posting |
| `invoicing.line-owner` | Invoices and exports | For a sponsorship: lines(type, id) gives the counterparty (the company, or the sponsor's name and address) and one line per payment due; entries() on issue returns − `fundraising.sponsorship-income`; on a credit note, the reverse. Also `invoicing.counterparty`, giving a sponsor's name and address where Companies is off |
| `core.measure` | Core (Reports reads it) | Figures, below |
| `core.record-resolver` | Core | Each of the six record types |
| `core.record-tab` | Core | Giving on `core.account` (their gifts and declarations, ability `fundraising.donation.view`); Sponsorships on `companies.company` (ability `fundraising.sponsorship.view`); Fundraising on `core.production` (campaigns and sponsors for the show) |
| `core.account-section` | Core | "Your giving" on My account, audience side: gifts, Gift Aid declaration, cancel |
| `core.search-source` | Core | Donations by reference or donor; campaigns and sponsorships by name |
| `core.setup-step` | Core | Create the default fund (required when switched on); Gift Aid details (optional) |
| `core.navigation` | Core | Console group Fundraising: Overview, Donations, Campaigns, Gift Aid, Sponsorships. Funds and the vocabularies sit in the cog modal |
| `core.vocabulary` | Core | `fundraising.sponsor-level`, `fundraising.benefit-kind`, `fundraising.correction-reason` |
| `core.notification-type` | Core | Templates in part 5's list |
| `core.health-check` | Core | Donations received with no posting (expects none); eligible gifts near their claim deadline (C6); a submitted claim unpaid after 90 days |
| `core.home-figure` | Core | "Raised this month" for people with `fundraising.donation.view` |
| `core.policy` | Core | The Gift Aid declaration page, kind `terms`, accepted at the moment of declaring |
| `core.privacy-record` | Core | Donations; Gift Aid declarations ("to claim tax back from HMRC, kept for six years after the last claim, as HMRC requires"); sponsorship contacts |
| `core.erasure-hold` | Core | Reports the Gift Aid hold (E2) and its end date |
| `communications.audience-source` | Communications | Donors, filterable by fund, campaign and date. Communications applies consent; Fundraising never sends appeals itself |
| `core.public-component` | Core | Open campaigns and active sponsors on a production's public page |

### Figures for `core.measure`

Aggregates only, no donor names, ability `fundraising.donation.view` unless stated. Ids follow the Reports thread's suggestion of 23 November 2026.

| Id | Unit | Combine | By |
| --- | --- | --- | --- |
| `fundraising.donations-count` | count | sum | `fundraising.fund`, `fundraising.campaign`, `fundraising.channel`, production, month |
| `fundraising.donations-total` | money | sum | as above |
| `fundraising.gift-aid-claimable` | money | sum | `fundraising.fund`, month. Ability `fundraising.claim.prepare` |
| `fundraising.gift-aid-claimed` | money | sum | `fundraising.fund`, month. Ability `fundraising.claim.prepare` |
| `fundraising.campaign-raised` | money | sum | `fundraising.campaign` |
| `fundraising.campaign-target` | money | level | `fundraising.campaign` |
| `fundraising.campaign-progress` | percent | ratio of raised over target | `fundraising.campaign` |
| `fundraising.sponsorship-income` | money | sum | season, production. Ability `fundraising.sponsorship.view` |
| `fundraising.donors` | count | distinct | month, `fundraising.channel` |
| `fundraising.regular-givers-new`, `fundraising.regular-givers-lapsed` | count | distinct | month. Later, with regular giving |

## Events

### Announced

| Event | When | Payload | Internal |
| --- | --- | --- | --- |
| `fundraising.donation.received` | A donation is received | `donationId`, `fundId`, `campaignId`, `productionId`, `amountMinor`, `currency`, `channel` | No |
| `fundraising.donation.refunded` | A refund of any size succeeds | `donationId`, `refundedMinor` | No |
| `fundraising.campaign.opened`, `fundraising.campaign.closed` | A campaign opens or closes | `campaignId` | No |
| `fundraising.campaign.target-reached` | K2 | `campaignId` | No |
| `fundraising.declaration.made`, `fundraising.declaration.ended` | G1, G8 | `declarationId` | Yes |
| `fundraising.claim.submitted`, `fundraising.claim.paid` | Part 3 | `claimId` | Yes |
| `fundraising.sponsorship.agreed`, `fundraising.sponsorship.ended` | Part 3 | `sponsorshipId`, `companyId` | No |

No payload names a person (E4). Webhooks may carry the non-internal events.

### Heard

| Event | Fundraising does |
| --- | --- |
| `invoicing.invoice.paid` | Raises a sponsorship's `received_minor` |
| `invoicing.invoice.credited` | Records the credit on the sponsorship; a withdrawal may then proceed |
| `companies.company.merged` | Repoints `company_id` on donations and sponsorships |
| `core.production.cancelled` | Closes campaigns tied only to that production, if still open, with a notice to their creators |

## Jobs and scheduled tasks

| Name | Kind | Does |
| --- | --- | --- |
| `fundraising.send-thanks` | job | Sends the thanks email after receipt, outside the settle unit |
| `fundraising.open-close-campaigns` | task, every 15 minutes | Opens and closes campaigns by their times |
| `fundraising.sponsorship-terms` | task, daily 04:00 | Moves sponsorships to active, ended and lapsed; sends renewal reminders |
| `fundraising.sweep-retention` | task, daily 04:00 | Applies the donation, sponsorship and Gift Aid retentions (E2) |
| `fundraising.recheck-gift-aid` | job | Recomputes Gift Aid status for one donor's gifts after a declaration is made or ended |

## Asked of other modules

| Of | What | Why |
| --- | --- | --- |
| Payments | **A code point** **`payments.checkout-extra`****.** Contract: `offer(context)` returns null or `{ label, panel, order }` for the page building an online payment (context: the owner module and record, the amount so far, the buyer if known); `prepare(unit, { input, buyer })` returns `{ owner: { module, record }, amountMinor }` for one more part, or nothing when the buyer chose none; `confirmationLine(record)` returns the line the owner shows on its confirmation page and email. An owner's online checkout calls it when it calls `collect` | Lets a donation ride in the same payment as tickets or a membership fee as its own part. Membership fees and later modules can offer extras too |
| Payments | **A service** **`receiveTransfer(unit, { owner: { module, record }, amountMinor, receivedOn, reference })`****.** Posts + `payments.bank` and asks the owner's `payments.settlement` handler (a new optional `received` method, shaped like `kept`) for its entries | Money arriving by cheque, transfer or from HMRC must reach the ledger without breaking the own-accounts rule |
| Box office | Call `payments.checkout-extra` in the online basket (FR-14); show the extra's line in the basket, on the confirmation page and in `box-office.order-confirmed`. Mark the order line kind `donation` withdrawn (never written; Fundraising's checkout part replaces it) and drop the planned `box-office.donation-income` account. The value stays in the CHECK until that table is next rebuilt for another reason, since rebuilding a large live table for it alone gains nothing | D3. The Festival-ready changes thread confirmed it does not touch checkout, so this goes to Integration |
| Membership fees | Call `payments.checkout-extra` on its pay page (later, FR-38) | The same offer when paying a supporters' scheme |
| Companies | Nothing new: `core.record-resolver` and picker for `companies.company`, `companies.company.merged`, and a record-tab slot on the company page (agreed 23 November 2026) |  |
| Invoices and exports | Nothing new: Invoices listens for `fundraising.sponsorship.agreed` and drafts from `invoicing.line-owner`; it announces, `invoicing.invoice.paid` and `.credited` (agreed 23 November 2026) |  |
| Core | The reserved address prefix `/support` | The donate pages |
| Foundations | Enter prefixes `gfd`, `gcp`, `gdn`, `gdc`, `gcl`, `gsp`, `gsb`, and later `grg`, `gco`, in the index; add `fundraising` to `RESERVED_MODULE_IDS` when accepted |  |

## Small donations and grants

Matt's decisions on questions 8 to 10 (24 November 2026) add the following to the interface above. Donor amounts and bands (question 8) need nothing across modules.

### Ledger accounts

| Account | Scope | Credited by |
| --- | --- | --- |
| `fundraising.grant-income` | per fund, made with the fund by `ensureScopedAccount` | Payments from funders (M7) |
| `fundraising.small-donations` | per fund, made with the fund | Small donations top-ups on claim submission (M8) |

### Events announced

| Event | Payload | Heard by |
| --- | --- | --- |
| `fundraising.grant.awarded` | `{ applicationId, fundId, productionId?, awardedMinor, currency }` | Budgets, to show committed income on a production's budget; Reports |
| `fundraising.grant.closed` | `{ applicationId, receivedMinor }` | Budgets |

### Contributions added

| Point | What Fundraising adds |
| --- | --- |
| `core.measure` | `fundraising.grants-asked`, `fundraising.grants-awarded`, `fundraising.grants-received`, `fundraising.grant-success-rate` (awarded over decided, by count), `fundraising.small-donations-topup`; aggregates only, needing `fundraising.grant.view` or `fundraising.reports.view` |
| `core.record-tab` | A Grants tab on `core.production` and on `companies.company` (as funder) |
| `core.record-resolver` | `fundraising.grant` and `fundraising.collection` |
| `core.search-source` | Grant applications by title and funder, staff with `fundraising.grant.view` only |
| `core.notification-type` | `fundraising.grant-deadline` and `fundraising.grant-report-due` (to the lead), `fundraising.collection-to-check` (to the second counter) |
| `core.health-check` | Overdue grant reports; small donations within the warning of their two-year limit; collections for another charity held past the hand-over notice (SD8) |

Collections for another charity (SD8) add nothing to this interface beyond that health check: no ledger account, no event, no measure, no search source. They are deliberately invisible to every other module, because the money was never the theatre's.

### Asked of other modules

| Module | Ask |
| --- | --- |
| Payments | Report the method of a settled till part (cash, contactless, chip and PIN) to its owner's settle handler, so SD2 can tell contactless from chip and PIN (PAY-09) |
| Budgets | Hear `fundraising.grant.awarded` and `.closed` to show grant income against a production's budget; Budgets reads no Fundraising table |
| Spaces | A space picker and `core.record-resolver` names for `fundraising.small-donations.community-buildings` and a collection's place (SP-55) |
