# 8. Test plan

Named cases that must never regress, by tier: unit and integration in Vitest on workerd with a local D1, journeys in Playwright against the built Worker. Time is injected; no test reads the real clock. Suites run on CI only. Payments' test provider stands in for a card provider throughout.

## Money and the ledger (integration)

| Test | Checks |
| --- | --- |
| Own part | A checkout with tickets and a gift creates one intent with two parts, box office's and fundraising's, summing to the total |
| Settle posts to the fund | Settling a gift posts + clearing and − the fund's `donations` account for exactly the gift's amount; the posting's `source_module` is fundraising |
| Settle twice | A repeated settle call changes nothing and posts nothing |
| Release | An expired intent marks the gift abandoned; a second release is harmless; a later settle of an abandoned gift is refused with a fundraising refusal code |
| Refund separation | Refunding the tickets of an order leaves its gift received; refunding the gift leaves the tickets |
| Part refund | Refunded minor rises; state stays received until the whole amount; the reversing entries equal the refund |
| Bank receipt | A recorded cheque posts + `payments.bank` and − the fund through `receiveTransfer`, one posting |
| Own-accounts rule | An entry from Fundraising on any other module's account is refused by Finance's trigger |
| Correction | Moving a gift between funds posts a transfer of the full amount and writes the reason; from a restricted fund without confirmation it is refused |
| Closed period | A gift recorded into a closed period posts today with `received_on` unchanged |
| Scoped accounts | Creating a fund creates both its scoped accounts in the same unit; a failed unit leaves neither |

## Giving rules (unit and integration)

| Test | Checks |
| --- | --- |
| Limits | Amounts one below min and one above max are refused online; staff recording is not limited |
| Never preselected | The checkout extra's initial state has no amount; adding then removing leaves the basket byte-for-byte the same |
| Amount locked | Changing amount, fund, channel or received date on a received gift is refused by the trigger |
| Campaign fund | A gift to a campaign always carries the campaign's fund; a donor's fund choice is ignored there |
| Closed campaign | Giving to a closed campaign is refused with a link to its fund |
| Guest thanks | A guest gift sends one thanks to the given email; an anonymous till gift with no email sends nothing |

## Gift Aid (unit, with fixed dates)

| Test | Checks |
| --- | --- |
| Enduring covers | A gift on `covers_from` is covered; one the day before is not |
| Past four years | A declaration made on 10 May 2027 with the past-years box covers a gift of 6 April 2023 and not 5 April 2023 |
| Ending | A gift on `ends_on` is not covered; one the day before is; ending never back-dates |
| Newest wins | With two covering declarations the newer is used for the claim line |
| Organisation | A gift with a company or organisation name is ineligible, reason organisation |
| Benefit | A gift with a benefit is ineligible, reason benefit |
| Deadline | With a year end of 31 March, a gift of 1 March 2027 is claimable until 31 March 2031 and too late from 1 April 2031 |
| Tickets never | No code path puts a box office, pass or membership fee part on a claim line |
| Supersede | A new address makes a new declaration and ends the old with reason superseded in one unit; the old row is unchanged |
| Append-only | Updating or deleting a declaration or an ending is refused by its trigger |
| Single cannot cancel | Ending a single declaration on a received gift is refused |
| Gift Aid needs a charity | Switching Gift Aid on without the charity name, HMRC reference, year end or GBP is refused, naming each missing setting |
| Off hides, keeps | With Gift Aid switched off, no Gift Aid field renders on any public page, and every declaration and claim remains |

## Claims (integration)

| Test | Checks |
| --- | --- |
| One live claim | Starting a second claim while one is draft or ready is refused |
| Thousand lines | 1,250 eligible gifts make a claim of 1,000 schedule lines; the rest stay eligible |
| Aggregation | Twelve gifts of £20 aggregate into one line; one of £20.01 does not; no aggregate passes £1,000; aggregation never crosses the accounting year end |
| Rounding | Each line's tax rounds down to the penny; the claim total is the sum of the lines |
| Schedule format | Title at most 4 characters, names at most 35, postcode upper case with a space, dates dd/mm/yy, amounts with two decimals and no pound sign; adjustments outside the rows |
| Never stored | Downloading the schedule writes no file and no personal value to a log or audit detail; the audit entry records the read |
| Second person | The person who made a claim ready cannot record it submitted; an Owner can |
| Submission posts | Submitting posts + receivable and − each fund's Gift Aid account by its lines; gifts become claimed |
| Payment difference | Recording payment of less than claimed posts the shortfall with its reason |
| Adjustment | A claimed gift refunded later appears once as an adjustment in the next claim and is marked adjusted |
| Cancel frees | Cancelling a ready claim frees its gifts for the next |

## Erasure, merge and privacy (integration)

| Test | Checks |
| --- | --- |
| Anonymise | Erasing a donor with no Gift Aid anonymises name, email, acknowledgement and message and keeps amounts |
| Gift Aid hold | Erasing a donor with a claimed gift keeps the declaration and the gift's name, shows the hold and its end on the erasure screen, and the sweep anonymises them after the retention |
| Never claimed | A declaration that covered no claimed gift is anonymised at once on erasure |
| Merge | After an account merge the donor's gifts and declarations appear under the survivor; the newest enduring declaration governs |
| Company merge | `companies.company.merged` repoints donations and sponsorships |
| Payloads | No event, job payload or `core.measure` row contains a name, address, email or message |

## Campaigns and sponsorships (integration)

| Test | Checks |
| --- | --- |
| Raised | Received less refunds plus offset, plus Gift Aid only when counted |
| Target once | Crossing the target twice announces once |
| Names and amounts | The names list never shows a donor who chose Anonymous, and shows an amount or band only under K3 |
| Open and close by time | The task opens and closes campaigns at their times, across a clock change |
| Sponsorship terms | The daily task moves agreed to active, active to ended and ended to lapsed on their dates; renewal reminder sent once |
| Invoice lines | `invoicing.line-owner` returns the sponsorship's lines; entries on issue credit `sponsorship-income`; a credit note reverses them |

## Small donations (integration)

| Test | Checks |
| --- | --- |
| Which gifts | Only till gifts in cash or by contactless at or under the limit with no declaration become eligible; chip and PIN, online, checkout and recorded gifts never; a gift at the limit counts, a penny over does not |
| Two counters | The same account as counter and checker is refused |
| Over the limit | Banking a collection makes an eligible and an excluded donation that sum to the total, in one unit |
| Lowest of three | The claimed figure is the least of eligible gifts, the cap plus each community building's allowance, and ten times the year's Gift Aid donations, on fixtures that make each one the least |
| One tax year | A claim refuses two tax years of small donations, and small donations without Gift Aid for that year |
| Two years | A tax year more than two years ended cannot be claimed; the warning comes first |
| Top-up posting | M8 posts per fund by share, each rounded down, and the parts sum to the claim's top-up |
| Never both | A small gift covered by a later declaration leaves the scheme and becomes a Gift Aid gift |
| Switching on | Refused while Gift Aid is off; the penalty confirmation is audited |
| For another charity | With Gift Aid and the scheme off and collections on, a collection for a named charity saves with two different counters; it adds no ledger entry, no donation, nothing to any total, measure or claim, and is refused without a charity name or with one counter (SD8) |
| Hand-over | Recording the hand-over date fixes the record; a later edit needs a fundraising manager and a reason, and is audited; a record held past the hand-over notice raises the health check, which clears once handed over |
| Switch off | With collections off, the "for another charity" choice is hidden and existing records stay readable; a charity collection can never be banked or turned into a donation |

## Grants (integration)

| Test | Checks |
| --- | --- |
| States | Every transition of part 3 and no other; withdrawing a submitted application records that the funder was told |
| Award differs | An award above or below the amount asked is accepted |
| Payments | M7 credits the fund's grant income; more than the award needs confirmation and a reason |
| Closing | Refused while a report is due; closing with less received than awarded needs a reason |
| Reminders | Deadline and report reminders are sent once, across a clock change |
| Private | No public page, search source or audience source exposes an application (GR7) |
| Company merge | `companies.company.merged` repoints the funder and keeps `funder_name` |
| Retention | The sweep anonymises the contact after `fundraising.retention.grants`; amounts and dates stay |

## Donor acknowledgement (integration)

| Test | Checks |
| --- | --- |
| Consent | An amount or band shows only when the campaign's `list_amounts` allows it and the gift has `show_amount`; otherwise the name alone |
| Bands | Default edges read "£50 to £99" and "£500 or more"; a gift exactly at an edge falls in the higher band |
| Withdrawal | Unticking in Your giving removes the amount at once; erasure clears `show_amount` |

## Journeys (Playwright)

| Journey | Checks |
| --- | --- |
| Give as a guest with Gift Aid | Give page, Gift Aid box, declaration, card form, thank-you page with reference, thanks email captured |
| Book with a gift | Tickets, add £5, remove it, add round up, pay; confirmation shows both; two parts settled |
| Till gift then Gift Aid | Seller takes £10 with an email; donor opens the link and declares; the gift becomes eligible |
| Cancel my declaration | Signed-in donor cancels from Your giving; later gifts are not covered; earlier remain |
| A claim from start to paid | Officer prepares, downloads, a second person records submission and payment; the ledger balances |
| Phone width | Every public Fundraising page at 375 pixels: no horizontal scroll, buttons at least 44 pixels |
