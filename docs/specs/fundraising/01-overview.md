# Fundraising: module specification

2026-11-23 · Matthew Adcock

Fundraising (`fundraising`) is a switchable module that takes gifts of money and keeps the record a charity needs to claim tax back on them. It covers donations at checkout, at the till and on their own; Gift Aid declarations and claims to HMRC; funds and campaigns with targets; and sponsorships with their benefits and renewals. It requires Payments and Finance, uses Box office, Membership, Communications, Companies and Invoices when they are on, and works with any of them off. This is its specification, written on 23 November 2026 in the third round, in the first round's nine parts.

## What this document settles

- **A donation is its own part of a payment.** At checkout, a donation rides in the same payment as the tickets but as a separate part owned by Fundraising, so Fundraising settles it, posts it to its own fund and refunds it on its own. Box office's unused order line kind `donation` is marked withdrawn and never written. This needs one new point, `payments.checkout-extra` (part 4).
- **Gift Aid is built in but off by default.** Declarations are append-only and ended by a separate row, like Identity's grants. A claim gathers eligible donations, writes HMRC's schedule spreadsheet for Charities Online, and posts Gift Aid income once it is submitted. Ticket money is never claimed on.
- **Patrons are Membership's supporters' schemes.** A Friends or patrons scheme already exists in Membership with fees through Membership fees; Fundraising does not build a second one (question 3).
- **Sponsors are a Fundraising record on a Companies company.** The sponsorship holds the amount, term, benefits and renewal; the organisation and its contacts are Companies'. Sponsors are invoiced through Invoices and exports.
- **Donors may be named with amounts or bands.** A campaign can list donors' names alone, with a band such as "£50 to £99", or with the exact amount, but each donor's amount appears only if that donor ticked a separate box to allow it (K3, Matt's decision on question 8).
- **The Small Donations Scheme is in the first release.** Counted bucket collections and small till gifts of £30 or less without a declaration earn a top-up claimed alongside the Gift Aid claim, within HMRC's limits (SD1 to SD7, question 9).
- **Grant applications are tracked in Fundraising.** An application to a funder runs from planned to decided, with deadlines, the reports owed afterwards and the payments received, credited to a grant income account for its fund (GR1 to GR7, question 10).
- **Collections for another charity are recorded, off the books.** Cash a theatre collects for a charity it supports is recorded with the charity, the date, the amount two people counted and the date it was handed over. It is never the theatre's income, so it never reaches the ledger, totals or any claim, and it works with Gift Aid off, as NNT needs (SD8, question 11).
- **Thirteen tables** (one of them later), eleven id prefixes starting `g` for giving, 53 stories FR-01 to FR-53 (4 gate, 42 first release, 7 later), and twelve questions, all decided by Matt on 24 November 2026 (part 9).

## How to read it

| Tab | Holds |
| --- | --- |
| 1. Scope | What the module owns, what it leaves to others, its words |
| 2. Data model | Every table in the Foundations layout |
| 3. States and rules | Life cycles of a donation, a declaration, a claim, a campaign and a sponsorship; the Gift Aid rules |
| 4. Interface | Services, points, events, ledger accounts, and what is asked of other modules |
| 5. Screens | Public pages, My account, console and the till panel; two wireframes |
| 6. Settings and abilities | One row each, in the registry columns |
| 7. Stories | FR-01 to FR-44 |
| 8. Test plan | Named cases by tier |
| 9. Questions for Matt | Ten decisions, each with a recommendation |
| Sources | Repository files and HMRC guidance used |

## Written against

Branch `next` of newtheatre/proscenium at merge 654: Foundations' formats and rulings, the kit guide, the Box office, payments and ledger specification and the built `payments`, `finance`, `box-office`, `membership-fees` and `promotions` layers. HMRC's Gift Aid guidance as published on gov.uk (chapter 3 of the charities detailed guidance, updated 20 October 2026). Boundaries agreed on 23 November with the Companies, Invoices and exports, Reports and Festival-ready threads.

## At a glance

_Diagram in the source doc: how a gift moves · four ways in, one fund_

Every way of giving ends as a Fundraising part of a Payments payment, so the gift lands in its fund's own ledger account. Gift Aid claims draw only on Fundraising's own donation rows; sponsorships lean on Companies for the organisation and on Invoices for the bill.
