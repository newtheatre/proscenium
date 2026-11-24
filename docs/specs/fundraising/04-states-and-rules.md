# 3. States and rules

Every change below is one unit of work: the row, its audit entry, any ledger posting and any event commit together or not at all. Rules are numbered so stories and tests can cite them: D for donations, G for Gift Aid, C for claims, K for campaigns, S for sponsorships, M for money, E for erasure, SD for small donations and GR for grants.

_Diagram in the source doc: life cycles · donation, Gift Aid status, claim_

A gift's money state and its Gift Aid status move separately: only a received gift has a status, and only an eligible one can join a claim. A claim's submission is the moment gifts become claimed and the Gift Aid income is posted.

## Donations

| From | To | When | Guard |
| --- | --- | --- | --- |
| (new) | `pending` | A donor presses Pay on the donate page, a checkout with a donation starts its payment, or a seller adds the Donation panel at the till | Amount within the limits (D1); fund active; campaign open, if any |
| (new) | `received` | Staff record a gift paid by cheque, transfer or elsewhere | Ability `fundraising.donation.record`; how\_received given; Payments' bank receipt service returns the posting (M4) |
| `pending` | `received` | Payments settles the part: Fundraising's `settle` handler | The part's amount equals the donation's; the donation is still pending |
| `pending` | `abandoned` | Payments releases the part: the intent expired, was cancelled or failed | None. Safe to run twice |
| `received` | `received` | A part refund | refunded\_minor rises, never past the amount |
| `received` | `refunded` | A refund brings refunded\_minor to the amount | Through Payments' refund flow only (D6) |

- **D1. Limits.** An online or checkout gift is at least `fundraising.giving.min` and at most `fundraising.giving.max`; above the maximum the donor is asked to contact the theatre. Staff recording a gift are not limited.
- **D2. A donation is optional and separate.** At checkout the donation step is never pre-filled with an amount, never ticked by default, and removing it never changes anything else in the basket. A buyer who adds and then removes a donation sees the same tickets at the same price.
- **D3. One gift, one part.** A donation has its own Payments part. At checkout it shares the intent with the other owner's part; at the till it is one panel's part. Fundraising never adds its amount to another module's line.
- **D4. The fund is fixed when received.** A campaign gift goes to the campaign's fund; a donor may choose among offered funds only when giving outside a campaign. After receipt the fund changes only by a correction (D7).
- **D5. Who the donor is.** A signed-in donor's account is the subject. A guest gives a name and email; the email is checked only by the receipt link, as Box office does for guests. At the till the seller may leave the donor unknown; such a gift can never have Gift Aid unless the donor completes the emailed link (G6).
- **D6. Refunds.** A staff member with `fundraising.donation.refund` asks Payments for a refund of the part; Payments' own approval rule applies, including that nobody approves a refund of their own request. A checkout refund of tickets never refunds the donation, and the reverse, unless the person asks for both.
- **D7. Corrections.** A donation received into the wrong fund or campaign is corrected by a staff member with `fundraising.donation.correct`: a Finance transfer posting moves the money between the funds' accounts and the row is updated, with a reason. Moving money out of a restricted fund asks for confirmation and a reason (it may breach the restriction).
- **D8. Thanks.** On receipt, the donor is sent `fundraising.donation-thanks` unless the gift is anonymous with no email. It states the amount, fund, date and reference and, where a declaration covers it, the Gift Aid line and how to cancel. A checkout donation is thanked inside the booking confirmation by a line the checkout extra supplies (part 4), not by a second email.

## Gift Aid declarations and eligibility

A donation's Gift Aid status is `none` while Gift Aid is off or the gift is pending, then settles as below. It is recomputed when the donation is received, when a declaration is made or ended, and when a claim is prepared.

| Status | Means |
| --- | --- |
| `none` | Gift Aid is off, or the gift is not received |
| `eligible` | Received, covered by a declaration and passing G1 to G5. Waiting for a claim |
| `ineligible` | Received but fails a rule; `gift_aid_reason` says which |
| `claimed` | On a submitted claim |
| `adjusted` | Refunded after it was claimed; the refund is on a later claim as a negative line |

_Diagram in the source doc: Gift Aid eligibility · five tests, five reasons_

The tests run in order and the first failure sets the reason; only a gift that passes all five waits for a claim.

- **G1. Covered.** A single declaration covers its one donation. An enduring declaration covers a donation received on or after `covers_from` and before any ending's `ends_on`. When two declarations cover one gift, the newer is used.
- **G2. From a person.** A gift with a `company_id` or an organisation name is `ineligible` (`organisation`). Sponsorship money is never a donation and never claimed on.
- **G3. Not for admission or membership.** Gift Aid is claimed only on donation rows. A ticket, a pass and a membership fee are other modules' parts and can never reach a claim. A donation that rode with a ticket order is eligible, because D2 makes it optional and the buyer could attend without it (HMRC chapter 3, "charity events").
- **G4. No benefit in the first release.** A gift with `has_benefit` is `ineligible` (`benefit`). Checking a benefit's value against HMRC's donor benefit limits (25% of the first £100, 5% above, £2,500 a tax year from one donor) is the later story FR-41.
- **G5. In time.** A donation whose claim deadline has passed is `ineligible` (`too-late`). The deadline is four years after the end of the accounting period it was received in, using `fundraising.gift-aid.year-end`.
- **G6. Completing Gift Aid later.** Any received gift that is `ineligible` for want of a declaration (`no-declaration`) may become eligible when the donor makes one, since an enduring declaration may cover the past four years. The thanks email for a till or guest gift carries a link (a single-use token, never the donation id) to a page that takes the declaration.
- **G7. A declaration is never edited.** A new name or address makes a new declaration that supersedes the old; the old is ended with reason `superseded` in the same unit. Staff correct a mistyped paper form the same way.
- **G8. Cancelling.** A donor cancels an enduring declaration from My account or by asking staff. The ending's date is today or a later date they choose, never earlier; gifts already received stay covered, as HMRC says. A single declaration cannot be cancelled once the gift is received.
- **G9. The tax statement.** Every declaration screen shows the theatre's declaration page in full, including that the donor must pay at least as much Income Tax or Capital Gains Tax in the tax year as all charities will reclaim on their gifts, and is responsible for any difference. "I am a UK taxpayer" alone is not enough and is never the only wording.
- **G10. Oral declarations are later.** A telephone or in-person declaration is effective only once a written record is sent, with a 30-day right to cancel back to the start. It is the later story FR-42 (question 7).
- **G11. Gift Aid needs a charity.** `fundraising.gift-aid.enabled` may be switched on only together with `fundraising.gift-aid.charity-name`, `fundraising.gift-aid.hmrc-reference` and `fundraising.gift-aid.year-end`, and only while `core.locale.currency` is GBP (settings rules checked together, as Foundations requires). Switching it off hides every Gift Aid screen and box but keeps every declaration, claim and status.

## Gift Aid claims

| From | To | When | Guard |
| --- | --- | --- | --- |
| (new) | `draft` | Staff start a claim up to a date | Ability `fundraising.claim.prepare`; no other claim is draft, ready or submitted-but-unpaid within the same `up_to` (C1) |
| `draft` | `draft` | Refresh: lines are gathered again | Eligible donations received up to `up_to`, not on another live claim, oldest first, until 1,000 schedule lines; adjustments for gifts refunded since they were claimed |
| `draft` | `ready` | Staff check the claim and make it ready | At least one line; the rate is copied; totals stored |
| `ready` | `draft` | Staff reopen it to change it | Not yet submitted |
| `ready` | `submitted` | Staff record that they uploaded the schedule to Charities Online | Ability `fundraising.claim.submit`, privileged and fresh; HMRC reference and date given; the gifts become `claimed` and adjustments `adjusted`; the Gift Aid posting is made (M2) |
| `submitted` | `paid` | Staff record HMRC's payment | Paid amount and date; the bank receipt is recorded (M3); a difference from the claimed amount is posted with a reason |
| `draft` or `ready` | `cancelled` | Staff cancel it | Its lines are freed for another claim |

_Diagram in the source doc: preparing a Gift Aid claim · eight steps, one outside the platform_

Everything up to the download happens in the platform; the upload is done by a person in Charities Online, and recording it is what marks the gifts claimed and posts the Gift Aid income.

- **C1. One claim at a time.** HMRC asks that one online claim be completed and submitted before the next is started, so only one claim may be draft or ready at once.
- **C2. The schedule.** Built on download in HMRC's layout: title, first name, last name, house name or number, postcode, aggregated donations, sponsored event (always blank), donation date (dd/mm/yy) and amount with two decimals and no pound sign. Gifts of £20 or less may be aggregated (setting `fundraising.gift-aid.aggregate`) into lines of at most £1,000, described "Aggregated donations" and dated by the latest gift; aggregation never crosses an accounting period. Adjustments are written in HMRC's adjustment box, not as negative rows.
- **C3. At most 1,000 lines.** A claim stops gathering at 1,000 schedule lines after aggregation; the rest wait for the next claim. Larger claims need HMRC-recognised software, which the platform is not.
- **C4. The tax.** Each line's tax is its amount times `rate_percent` / 100, rounded down to the penny; the claim's total is the sum of its lines. At the basic rate of 20% the setting is 25.
- **C5. The download is guarded.** Downloading the schedule needs `fundraising.claim.prepare` with `audit: 'read'`, is rate-limited as an export, and the file is never stored or emailed.
- **C6. A warning before the deadline.** A health check warns when an eligible gift is within `fundraising.gift-aid.deadline-warning` of its claim deadline.

## Campaigns

| From | To | When | Guard |
| --- | --- | --- | --- |
| (new) | `draft` | Staff create a campaign | Ability `fundraising.campaign.manage`; slug free |
| `draft` | `open` | Published, or `opens_at` passes for a published campaign | Title, summary and fund set |
| `open` | `closed` | `closes_at` passes (task) or staff close it | None. A closed campaign's page stays, saying it has closed, with a link to give to its fund |
| `closed` | `open` | Staff reopen it | closes\_at cleared or moved later |
| `closed` | `archived` | Staff archive it | Leaves the public site; its donations and totals stay |

_Diagram in the source doc: campaign life cycle · four states_

A closed campaign can be reopened; an archived one leaves the public site but keeps its gifts and totals.

- **K1. Raised.** Received donations to the campaign, less refunds, plus `offset_minor`, plus Gift Aid on its gifts (claimed and eligible) when `count_gift_aid` is on. Computed from Fundraising's own rows; never cached beyond the page's cache window.
- **K2. Target reached.** The first receipt that takes raised to the target sets `target_reached_at` and announces `fundraising.campaign.target-reached` once. A refund that takes it back under does not unset it.
- **K3. Names and amounts.** With `list_names` on, the page lists `acknowledge_as` for received gifts whose donor gave a name, newest first. Beside a name it shows nothing, the band or the exact amount, as `list_amounts` says, and only for a gift whose donor ticked the separate box allowing it (`show_amount`); every other named gift shows the name alone. Bands come from `fundraising.acknowledgement.bands` and read "£50 to £99", the top band "£500 or more". A donor can withdraw either consent from Your giving and the page follows at once (Matt's decision on question 8).

## Sponsorships

| From | To | When | Guard |
| --- | --- | --- | --- |
| (new) | `proposed` | Staff record an approach | Ability `fundraising.sponsorship.manage` |
| `proposed` | `agreed` | Terms agreed | Amount or in-kind, dates and scope set; an invoice may be raised (S3) |
| `agreed` | `active` | `starts_on` arrives (task) | None |
| `active` | `ended` | `ends_on` passes (task) | None |
| `ended` | `lapsed` | `fundraising.sponsorship.lapse-after` passes with no renewal agreed | None |
| `proposed` or `agreed` | `withdrawn` | Staff record that it fell through | A raised invoice must be credited first |
| `ended` | (a new row) | Staff renew it | The new row's `renewal_of_id` is the old one |

_Diagram in the source doc: sponsorship life cycle · six states and a renewal_

An ended sponsorship is renewed by a new row that points back to it, so each year's terms stay as agreed.

- **S1. Benefits are a checklist.** Each benefit is ticked when delivered. A ticket benefit links to Box office's complimentary request with reason "sponsor" in a later story; until then it is ticked by hand.
- **S2. Renewal reminders.** `fundraising.sponsorship.renewal-notice` before `ends_on`, the person who looks after it is told once.
- **S3. Money.** With Invoices and exports on, agreeing a sponsorship with an amount announces `fundraising.sponsorship.agreed`; Invoices hears it and makes a draft invoice from the lines Fundraising gives through `invoicing.line-owner`, which a person checks before it goes out; income is credited when the invoice is issued and `received_minor` rises on `invoicing.invoice.paid`. Without it, a received payment is recorded with Payments' bank receipt service (M4).
- **S4. Public acknowledgement.** An active sponsorship with `acknowledge` on appears on the supporters page and, if it covers a production, on that production's page, with its logo and link.

## Small Donations Scheme

_Diagram in the source doc: Small Donations Scheme · two routes into one claim_

Two routes lead to an eligible small gift: a counted and banked collection, or a small cash or contactless gift at the till that no declaration covers. Either way the top-up is only asked for inside that tax year's Gift Aid claim.

- **SD1. Only with Gift Aid.** `fundraising.small-donations.enabled` may be switched on only while Gift Aid is on, and switching it on asks the treasurer to confirm the theatre has had no Gift Aid or small donations penalty in the last two tax years (HMRC's condition); the confirmation is audited. Switching it off hides every screen and leaves every status as it is.
- **SD2. Which gifts count.** A till donation of at most `fundraising.small-donations.limit` paid in cash or by contactless card (Payments' card entry method, PAY-09; Apple Pay and Google Pay at a reader count as contactless) with no declaration covering it, and the counted part of a collection. Online, checkout and recorded gifts never count, nor does a chip-and-PIN payment. A gift covered by a declaration is claimed under Gift Aid, never both. Notes or cheques above the limit found in a count are `excluded`.
- **SD3. Counting and banking.** Two people count a collection and the second is never the first. Banking records the money through Payments' bank receipt service and makes the collection's donations in the same unit (part 2).
- **SD4. Status.** `eligible` becomes `claimed` when the claim that carries its tax year is submitted. A refunded small gift becomes `excluded` if unclaimed; once claimed, its amount comes off the next claim's small donations figure.
- **SD5. The limits.** For a tax year (6 April to 5 April) the small donations claimed are the lowest of: the eligible small gifts of that year; `fundraising.small-donations.annual-cap` (HMRC's £8,000), plus up to the same again for each space in `fundraising.small-donations.community-buildings` from gifts collected in that space; and ten times the Gift Aid donations claimed for that tax year. The top-up is that total times `rate_percent` / 100, rounded down.
- **SD6. Inside the Gift Aid claim.** A claim carries at most one tax year's small donations and must also carry Gift Aid for that tax year. The claim record shows the figures to type into Charities Online's small donations boxes; there is no schedule of small gifts. A year's small donations must be claimed within two years of its end, and C6's warning covers them.
- **SD7. Shared limit.** A theatre connected to other charities shares HMRC's £8,000 with them, so it lowers `fundraising.small-donations.annual-cap` to its share; the setting's help says so.
- **SD8. Collections for another charity.** With `fundraising.collections.enabled` on (off by default, and independent of Gift Aid and the scheme), a collection can be recorded for a named charity instead of a fund. It needs the charity's name, the date, the amount and two different counters, as SD3. It is never banked through Payments, never posts to the ledger, never becomes a donation, and never counts in the theatre's totals, campaign figures, measures, Gift Aid or small donations claims. Its only later step is recording the date it was handed over; until then it shows as held, and a health check flags one held more than 30 days. Once handed over it is fixed; a mistake is corrected by a fundraising manager with a reason, audited.

## Grant applications

| From | To | When | Guard |
| --- | --- | --- | --- |
| (new) | `planned` | Staff record an opportunity | Ability `fundraising.grant.manage`; title, funder and fund given |
| `planned` | `drafting` | Work starts | A lead is set |
| `drafting` | `submitted` | Sent to the funder | `asked_minor` and `submitted_on` set |
| `submitted` | `awarded` | The funder says yes | `awarded_minor`, `decided_on` and conditions set; announces `fundraising.grant.awarded` |
| `submitted` | `declined` | The funder says no | `decided_on` set |
| `planned`, `drafting` or `submitted` | `withdrawn` | The theatre stops | A reason |
| `awarded` | `closed` | Nothing more is owed either way | Every report sent or waived; if `received_minor` is below `awarded_minor`, a reason |

_Diagram in the source doc: grant application life cycle · seven states_

Only an awarded application takes money and owes reports; a declined or withdrawn one simply stays on record.

- **GR1. Deadlines.** While planned or drafting, the lead is reminded `fundraising.grants.deadline-notice` before `deadline_at`, once.
- **GR2. The funder.** With Companies on, the funder is chosen from Companies and its name copied; `companies.company.merged` repoints it. Without Companies the name is typed.
- **GR3. Stopping.** A planned, drafting or submitted application can be withdrawn with a reason; a submitted one withdrawn says the funder was told.
- **GR4. The award.** The awarded amount may differ from the amount asked. Conditions are kept as text and shown on the fund it is credited to, so spending staff see them.
- **GR5. Money.** A payment from the funder is recorded through Payments' bank receipt service, posts M7 and raises `received_minor`. Receiving more than the award asks for confirmation and a reason. A grant is never a donation and never carries Gift Aid.
- **GR6. Reports owed.** On award, staff add each report the funder asks for. A due report reminds the lead `fundraising.grants.report-notice` before `due_on`; an overdue one shows on the overview and in a health check. A report is marked sent, with the date, or waived, with a reason.
- **GR7. Internal only.** Applications, amounts asked and declines are never public. Thanking a funder publicly is done by recording a sponsorship with acknowledgement (S4).

## Money

- **M1. On receipt.** + the payment's clearing account (Payments); − `fundraising.donations` for the donation's fund. The settle handler returns the entry; Payments writes the posting. A refund reverses it in the same way.
- **M2. On claim submission.** + `fundraising.gift-aid-receivable`; − `fundraising.gift-aid` for each fund, by the claim's lines. Fundraising posts this itself, as every account is its own.
- **M3. On HMRC's payment.** Payments' bank receipt service posts + `payments.bank` and Fundraising returns − `fundraising.gift-aid-receivable`. A shortfall or excess is posted between the receivable and `fundraising.gift-aid` with the reason.
- **M4. Money received without a payment.** A cheque, a transfer or HMRC's payment arrives in the bank, not through a provider. Fundraising records it through Payments' bank receipt service (asked for in part 4), which posts the bank side and calls Fundraising for its entries, so the ledger's rule that a module posts only to its own accounts holds.
- **M5. Restricted money stays restricted.** Gift Aid on a gift to a restricted fund is credited to that fund's Gift Aid account.
- **M6. Periods.** Nothing is posted into a closed Finance period; a gift recorded late is posted on today's date with its `received_on` kept for Gift Aid.
- **M7. Grant income.** A payment against an award: Payments' bank receipt service posts + `payments.bank` and Fundraising returns − `fundraising.grant-income` for the award's fund, carrying the award's `production_id` on the entry when it has one, so Budgets counts received grant income from the ledger alone (BC-46); the `fundraising.grant.awarded` event gives only the awarded, not yet received, figure.
- **M8. Small donations top-up.** Posted like Gift Aid: on submission + `fundraising.gift-aid-receivable`, − `fundraising.small-donations` for each fund by its share of the small gifts; cleared on HMRC's payment as in M3.

## Erasure and merge

- **E1. Erasure anonymises the donor.** Name, email, acknowledgement and message are anonymised or redacted; amounts, funds, dates and Gift Aid status stay.
- **E2. Gift Aid records are kept.** A declaration and the name on donations it covers are retained until `fundraising.retention.gift-aid` after the end of the accounting period of the last claimed gift it covers. Fundraising contributes a `core.erasure-hold` that reports this hold and its end date on the erasure screen, and the retention sweep anonymises them once it passes. A declaration that never covered a claimed gift is anonymised at once.
- **E3. Merge.** Every account column is `alias`. After a merge, the merged person's declarations stay as they were; the newest enduring declaration across both governs G1. `companies.company.merged` repoints `company_id` on donations and sponsorships.
- **E4. No personal detail travels.** Events, job payloads, audit detail and the Reports figures carry ids and amounts only, never a name, address or message.
