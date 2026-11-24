# 5. Screens

Twenty-eight screens and one till panel, in the shells and page types Interface defined: public pages on the theatre's site, a section of My account, console pages in a Fundraising group, and settings in the cog modal. Every list follows the list design (search icon by New, archived below a collapsible divider, right-click menu on rows); every money field is a minor-units input with the currency shown; every form validates inline with Nuxt UI, never a browser popup. Gift Aid words appear only when Gift Aid is on (principle 4).

## Inventory

| # | Screen | Address | Shell and type | Who sees it |
| --- | --- | --- | --- | --- |
| P1 | Support us | `/support` | Public, content page | Everyone. Lists open campaigns, the offered funds, sponsors who may be named; a Give button. The theatre may add its own Nuxt Content text above |
| P2 | Campaign | `/support/<slug>` | Public, content page | Everyone. Title, image, body, progress (if shown), names (if listed), Give |
| P3 | Give | `/support/give` (with `?campaign=` or `?fund=`) | Public, form | Everyone. Amount presets and own amount, fund (outside a campaign), name and email or signed in, Gift Aid box and declaration, acknowledgement, message, then the card form |
| P4 | Thank you | `/support/thanks/<token>` | Public, confirmation | The donor, by the receipt link. Reference, amount, Gift Aid status, "Add Gift Aid" if missing (G6), share link for a campaign |
| P5 | Add Gift Aid | `/support/gift-aid/<token>` | Public, form | A donor from a till or guest thanks email. Declaration for that gift and optionally the past four years and future |
| P6 | Checkout donation step | In Box office's basket | Public, basket section | Buyers, when `fundraising.checkout.enabled`. Wireframe 1 |
| A1 | Your giving | `/account/giving` | My account, audience side | Signed-in donors with any gift or declaration. Gifts, the declaration in force with Cancel, past declarations, Gift Aid status per gift |
| A2 | Cancel Gift Aid | Modal on A1 | My account | The donor. Choose today or a later date; states that past gifts stay covered (G8) |
| C1 | Fundraising overview | `/console/fundraising` | Console, home | `fundraising.donation.view`. Raised this month and year by fund, open campaigns with progress, Gift Aid claimable, sponsorships due for renewal |
| C2 | Donations | `/console/fundraising/donations` | Console, list | `fundraising.donation.view`. Columns: reference, donor, amount, fund, campaign, channel, received, Gift Aid. Filters by each. New: "Record a gift" |
| C3 | Donation | `/console/fundraising/donations/<id>` | Console, record | As C2. Facts, the payment (link to Payments), Gift Aid status and reason, declaration, claim; actions Refund, Correct, Send thanks again |
| C4 | Record a gift | Modal from C2 | Console, form | `fundraising.donation.record`. Donor (find an account or type a name and email, or an organisation from Companies), amount, fund, campaign, how received, date, paper declaration (with upload) |
| C5 | Campaigns | `/console/fundraising/campaigns` | Console, list | `fundraising.campaign.manage`. Title, state, raised of target, dates |
| C6 | Campaign | `/console/fundraising/campaigns/<id>` | Console, record with edit | As C5. Details, page text with preview, settings (show total, count Gift Aid, list names), donations tab, Publish, Close |
| C7 | Gift Aid | `/console/fundraising/gift-aid` | Console, list | `fundraising.claim.prepare`. Claims, newest first, with state and totals; eligible not yet claimed; ineligible by reason; New claim |
| C8 | Claim | `/console/fundraising/gift-aid/claims/<id>` | Console, record | As C7. Wireframe 2 |
| C9 | Declarations | `/console/fundraising/gift-aid/declarations` | Console, list | `fundraising.declaration.view`, audited read. Donor, kind, made, method, in force or ended. Search by name or postcode |
| C10 | Declaration | `/console/fundraising/gift-aid/declarations/<id>` | Console, record | As C9. The fields, the wording version, the gifts it covers, End (with reason), Supersede (new address) |
| C11 | Sponsorships | `/console/fundraising/sponsorships` | Console, list | `fundraising.sponsorship.view`. Sponsor, level, covers, amount, term, state, benefits delivered of due |
| C12 | Sponsorship | `/console/fundraising/sponsorships/<id>` | Console, record with edit | `fundraising.sponsorship.manage`. Terms, benefits checklist, invoice status (from Invoices), renewal, Renew |
| T1 | Account record tab | Giving, on a person's record | Console, record tab | `fundraising.donation.view`. Their gifts and declarations |
| T2 | Company record tab | Sponsorships, on a Companies company | Console, record tab | `fundraising.sponsorship.view` |
| T3 | Production record tab | Fundraising, on a production | Console, record tab | `fundraising.campaign.manage`. Campaigns and sponsors for the show |
| S1 | Fundraising settings | Cog modal on C1 | Console, settings | `fundraising.settings.manage`. Tabs: Giving, Funds, Gift Aid, Sponsorship, Vocabularies |
| D1 | Donation till panel | In the combined till | Till panel and live panel | `fundraising.donation.take`. Presets, own amount, fund, optional email |
| 25 | Collections | `/console/fundraising/collections` | Console, list page | `fundraising.collection.record`; with the Small Donations Scheme or collections for another charity on; a For column shows the fund or the charity, and charity rows show Held or Handed over with a Record hand-over action |
| 26 | Collection count | `/console/fundraising/collections/new` | Console, form page | `fundraising.collection.record`; the second counter confirms on their own device or by signing in on the same one; with collections on, a "For" choice of a fund or another charity, and choosing a charity swaps the fund field for the charity's name |
| 27 | Grants | `/console/fundraising/grants` | Console, list page with Upcoming deadlines and Reports due at the top | `fundraising.grant.view` |
| 28 | Grant application | `/console/fundraising/grants/[id]` | Console, record page: details, award, payments, reports, files | `fundraising.grant.view`; changes need `fundraising.grant.manage` |

Two existing screens change with Matt's decisions. The Give page and the checkout gift card gain a second unticked box, "Show my amount beside my name", only while the campaign lists amounts or bands and only once a name is given (K3). The Gift Aid claim record gains a Small donations panel showing the tax year, eligible small gifts, the limits applied and the top-up, with the figures to type into Charities Online (SD6).

## Key behaviours

- **Give (P3).** One column on a phone. Presets are buttons (from `fundraising.giving.presets`), the first never preselected; "Other amount" opens a money input with the limits stated beside it. The Gift Aid box is unticked, explains in one line what Gift Aid is worth ("Gift Aid adds £2.50 to your £10 at no cost to you"), and opens the name and address fields and the declaration text with "This gift only" or "This and all my gifts, including those of the last four years". The total is on the Pay button.
- **Checkout (P6).** A quiet card below the tickets, titled from the campaign or "Add a gift to support the theatre": presets, Other, and "Round up to £X" when round up is on. Nothing is selected. Adding it adds a line to the basket summary with Remove; the declaration fields appear only after a gift is added and Gift Aid is on. Wireframe 1.
- **Till (D1).** Large buttons in live mode. A seller adds a gift alone or beside tickets and a drink; if an email is given the donor is sent the thanks with the Add Gift Aid link. The seller never takes an address at the till in the first release (question 7).
- **Claim (C8).** The claim reads top to bottom as its life: totals, then the lines grouped as the schedule will show them, then the one action that moves it on. Download is offered only when ready, and recording submission asks for HMRC's reference and date. Wireframe 2.

## Notifications

| Template | To | When |
| --- | --- | --- |
| `fundraising.donation-thanks` | The donor | A gift is received (D8). With Gift Aid line or the Add Gift Aid link |
| `fundraising.declaration-confirmed` | The donor | A declaration is made, with its scope and how to cancel |
| `fundraising.declaration-ended` | The donor | An enduring declaration ends, by them or by staff |
| `fundraising.campaign-target-reached` | The campaign's creator and holders of `fundraising.campaign.manage` | K2 |
| `fundraising.sponsorship-renewal-due` | The person who looks after it | S2 |
| `fundraising.claim-deadline-near` | Holders of `fundraising.claim.prepare` | C6, at most weekly |

## Wireframes

### 1. Give page and checkout, on a phone

_Diagram in the source doc: wireframe · Give page and the checkout gift card, 375 px wide_

On the Give page the donor picks an amount and sees the total on the Pay button; the Gift Aid box is unticked until they tick it. In the basket the gift card sits below the tickets with nothing chosen, and choosing one adds a Gift line to the summary with Remove beside it.

### 2. A Gift Aid claim, ready to submit

_Diagram in the source doc: wireframe · claim record in the console, with the Record submission dialog open_

The claim shows what HMRC will see: the totals, the schedule lines with small gifts aggregated, and adjustments for earlier claims. Recording the submission asks for HMRC's reference and date, and is refused to the person who made the claim ready.
