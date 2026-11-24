# 9. Questions for Matt

Ten decisions, each with a recommendation; the rest of the document is written as if each recommendation were accepted, so a different answer changes the parts named.

**All decided by Matt on 24 November 2026.** Nine as recommended (1, 2, 2b, 3, 4, 5, 6, 7, and 11, added later the same day) and three otherwise: donors may be named with amounts or bands (8), the Small Donations Scheme is in the first release (9) and grant applications are tracked in Fundraising (10). The rest of the document now follows these answers; each question below ends with its decision.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | How does a gift at checkout ride with the tickets? | As its own payment part owned by Fundraising |
| 2 | Build Gift Aid in, and on by default? | Built in, off by default, switched on by a charity with its HMRC reference |
| 3 | Are patrons and Friends a Fundraising feature? | No: they are Membership's supporters' schemes |
| 4 | Where does a sponsor's organisation live? | In Companies; Fundraising holds the sponsorship |
| 5 | Regular giving in the first release? | No: later, once Payments can take recurring payments, card first |
| 6 | Show campaign totals publicly? | Per campaign, on by default, Gift Aid not counted by default |
| 7 | Take Gift Aid declarations at the till? | Not by voice: email the donor a link to complete it |
| 8 | Name donors publicly? | Only those who choose to, per campaign, never with amounts |
| 9 | Small Donations Scheme for bucket collections? | Later |
| 10 | Grant applications to trusts and funders? | Out of scope; a grant received is recorded as a gift from an organisation |

## 1. How does a gift at checkout ride with the tickets?

**Options.** (a) A box office order line of kind `donation`, as the Box office specification left room for, with Fundraising told by an event. (b) A separate part of the same payment, owned by Fundraising, through a new point `payments.checkout-extra`.

**Recommendation: (b).** Payments already settles one payment for several owners (the till does it every night). Under (b) Fundraising settles, refunds and posts its own money to its own fund, a ticket refund cannot take the gift with it, and Membership fees can offer the same box. Under (a) Box office would own money that is not a ticket and Fundraising would have to mirror it.

**What it costs.** One point in Payments and a call in Box office's basket; Box office's unused `donation` line kind is marked withdrawn and never written; it leaves the table's CHECK only when that table is next rebuilt for another reason.

**Decided: (b), as recommended.**

## 2. Build Gift Aid in, and on by default?

**Options.** (a) No Gift Aid; theatres export donors and claim elsewhere. (b) Built in and off until switched on. (c) On by default.

**Recommendation: (b).** For a charity theatre Gift Aid adds 25% to most gifts, and the record-keeping is exactly what the platform is good at. But only a registered charity may claim, and NNT, as a students' union society, probably cannot claim in its own name. Off by default hides every Gift Aid word until a charity supplies its HMRC reference.

**What it costs.** Four tables' worth of care (declarations, endings, claims, lines) and HMRC's schedule format, which changes rarely. Direct submission to HMRC is not built: the schedule is uploaded by a person to Charities Online, which HMRC allows up to 1,000 lines.

**Also asked.** Should NNT switch the module on at all? If the union collects donations for societies, NNT might use donations without Gift Aid, or not at all.

**Decided: (b), as recommended. NNT does not switch the module on yet.**

**NNT's facts (Matt, 24 November 2026).** Donations to NNT are technically received by the students' union, which will not claim Gift Aid on them. So when NNT does switch the module on, it runs with Gift Aid off and donations received through the SU's accounts, and the Small Donations Scheme can never apply to NNT, because it depends on Gift Aid. NNT also sometimes collects cash for charities it supports, and that money goes straight to those charities (question 11).

## 3. Are patrons and Friends a Fundraising feature?

**Options.** (a) Membership's supporters' schemes, which exist already with fees through Membership fees and benefits through requirements. (b) Fundraising's own patron tiers with benefits.

**Recommendation: (a).** A supporters' scheme is already a paid, renewing relationship with benefits such as a member price; building a second would give two ways to do one thing. Fundraising's part is later: a gift added when paying a scheme's fee (FR-38). Gift Aid is never claimed on a scheme fee, because HMRC treats a fee that buys benefits as not a gift.

**Decided: (a), as recommended.**

## 4. Where does a sponsor's organisation live?

**Options.** (a) Companies holds the organisation and contacts; Fundraising holds the sponsorship and shows it on the company's page. (b) Fundraising keeps its own sponsor records.

**Recommendation: (a)**, agreed with the Companies thread. A business that sponsors a season may also hire a room or bring a show; one record serves all three. With Companies off, a sponsorship keeps a plain name and contact.

**Decided: (a), as recommended.**

## 5. Regular giving in the first release?

**Options.** (a) Now, through card subscriptions. (b) Now, through Direct Debit (GoCardless). (c) Later, once Payments has a recurring capability, card first.

**Recommendation: (c).** Payments today takes single payments only; a recurring payment needs a mandate, retries and failure handling designed once in Payments for both Membership renewals and regular gifts. The table is sketched (`fundraising_regular_gifts`) so nothing has to be reworked.

**Integration.** Recorded as ruling R3-18: regular giving waits on one later recurring capability in Payments, shared with Membership renewals.

**Decided: (c), as recommended.**

## 6. Show campaign totals publicly?

**Options.** (a) Always. (b) Per campaign, on by default. (c) Never.

**Recommendation: (b), with Gift Aid not counted by default.** A visible total helps an appeal; a small one can put people off, so the theatre chooses. Counting Gift Aid inflates a total with money not yet received, so it is a deliberate choice.

**Decided: (b), as recommended.**

## 7. Take Gift Aid declarations at the till?

**Options.** (a) Oral declarations, with the written record HMRC requires sent afterwards. (b) The seller takes an email; the donor completes the declaration from a link. (c) No Gift Aid on till gifts.

**Recommendation: (b) now, (a) later as FR-42.** Typing a name and address at a busy bar is slow and error-prone, and an oral declaration is not effective until its written record is sent. A link gets the same result with the donor's own typing.

**Decided: (b) now, as recommended.**

## 8. Name donors publicly?

**Options.** (a) Never. (b) Only donors who choose a name, per campaign, without amounts. (c) Named with amounts or bands.

**Recommendation: (b).** Public thanks matters to a campaign, but amounts beside names invite comparison and are personal data many donors would not expect to see published.

**Decided: (c), named with amounts or bands.** Each campaign chooses names alone, bands or exact amounts; a donor's amount shows only if that donor ticks a separate box (K3, FR-48).

## 9. Small Donations Scheme for bucket collections?

**Options.** (a) In the first release. (b) Later.

**Recommendation: (b).** The scheme needs Gift Aid claims in the same tax year first, caps at £2,000 a year (25% of £8,000 of collections of £30 or less), and needs collections counted and banked by location. It is worth building once a theatre uses Gift Aid here.

**Decided: (a), in the first release.** Collections, small till gifts and the top-up are specified as SD1 to SD7 and FR-39, FR-45 to FR-47.

## 10. Grant applications to trusts and funders?

**Options.** (a) A pipeline of applications, deadlines and reports in Fundraising. (b) Out of scope: a grant received is a recorded gift from an organisation to a restricted fund.

**Recommendation: (b).** No theatre in view has asked, and application tracking is mostly documents and deadlines, which Governance's document register and Productions' tasks may cover. Arts Council or union funding to the theatre can be recorded as a gift today.

**Decided: (a), tracked in Fundraising.** Applications, awards, payments and reports owed are specified as GR1 to GR7, M7 and FR-49 to FR-52, with an event for Budgets.

## 11. Record collections taken for another charity?

**Decided: (a), as recommended.** Raised by Matt's NNT facts on 24 November: NNT sometimes collects cash for charities it supports, and the money goes straight to them.

**Options.** (a) A simple record in Fundraising: which charity, the date, the amount two people counted and the date it was handed over. It is never posted to the ledger, never counted in NNT's totals or figures, and never in a Gift Aid or small donations claim. It works with Gift Aid off, under its own switch `fundraising.collections.enabled`. (b) Not recorded in the platform; the theatre keeps its own note.

**Recommendation: (a).** Two counters and a handed-over date protect the volunteers who held the cash, and a theatre can show what it raised for others. It reuses the collection screen with a "for another charity" choice: one table column and one setting, with no money, ledger or claim rules. If chosen, it adds collection columns `beneficiary_name` and `handed_over_on`, rule SD8 and one story.

**Decided:** (a), Matt, 24 November 2026. Specified as rule SD8, collection columns `beneficiary_name` and `handed_over_on`, settings `fundraising.collections.enabled` and `fundraising.collections.hand-over-notice`, story FR-53 and three tests. No new table, prefix, account or event.
