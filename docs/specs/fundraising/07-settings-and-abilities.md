# 6. Settings and abilities

Thirty-three settings and twenty abilities. Settings are on the module's console page, reached from the cog on the Fundraising overview, except the retention group, which is advanced. Every number is a proposed default that a theatre can change; Gift Aid's legal figures are settings too, so a change in tax law is a settings change, not a release.

## Settings

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fundraising.giving.presets` | list of minor units | 500, 1000, 2500, 5000 | 1 to 6 values, each within min and max | `fundraising.settings.manage` | public | No | Amount buttons on the Give page and the till panel |
| `fundraising.giving.min` | minor units | 100 | 100 to 10,000 | `fundraising.settings.manage` | public | Yes | Smallest online gift (D1) |
| `fundraising.giving.max` | minor units | 500,000 | 1,000 to 10,000,000 | `fundraising.settings.manage` | public | Yes | Largest online gift; above it, contact the theatre (D1) |
| `fundraising.giving.pay-within` | duration | 30m | 10m to 2h | `fundraising.settings.manage` | staff | No | How long a standalone gift's payment stays open |
| `fundraising.checkout.enabled` | boolean | false |  | `fundraising.settings.manage`, with confirmation | public | No | Offer a gift at online checkout |
| `fundraising.checkout.presets` | list of minor units | 200, 500, 1000 | 1 to 4 values | `fundraising.settings.manage` | public | No | Smaller buttons in the basket |
| `fundraising.checkout.round-up` | choice | `pound` | `off`, `pound`, `five-pounds` | `fundraising.settings.manage` | public | No | The round-up button (D2) |
| `fundraising.checkout.campaign` | reference to a campaign | none | an open campaign | `fundraising.settings.manage` | public | No | Checkout gifts go to this campaign; none means the default fund |
| `fundraising.desk.enabled` | boolean | true |  | `fundraising.settings.manage` | staff | No | The Donation panel in the till |
| `fundraising.campaigns.show-total` | boolean | true |  | `fundraising.settings.manage` | staff | No | Default for a new campaign's show total |
| `fundraising.campaigns.count-gift-aid` | boolean | false |  | `fundraising.settings.manage` | staff | No | Default for counting Gift Aid toward raised (K1) |
| `fundraising.gift-aid.enabled` | boolean | false | needs the three below and GBP (G11) | `fundraising.settings.manage`, with confirmation | public | No | Gift Aid on or off |
| `fundraising.gift-aid.charity-name` | text | unset | 1 to 120 characters | `fundraising.settings.manage`, with confirmation | public | Yes | The charity named in every declaration |
| `fundraising.gift-aid.hmrc-reference` | text | unset | HMRC's charity reference format | `fundraising.settings.manage`, with confirmation | staff | No | Shown on the claim screen for submission |
| `fundraising.gift-aid.year-end` | month and day | unset | a valid date | `fundraising.settings.manage`, with confirmation | staff | No | End of the charity's accounting period, for the claim deadline (G5) and aggregation (C2) |
| `fundraising.gift-aid.rate-percent` | integer (percent) | 25 | 1 to 100 | `fundraising.settings.manage`, with a reason | staff | Yes | Gift Aid as a share of the gift: 25 at a basic rate of 20% (C4) |
| `fundraising.gift-aid.aggregate` | boolean | true |  | `fundraising.settings.manage` | staff | No | Aggregate gifts of £20 or less on the schedule (C2) |
| `fundraising.gift-aid.deadline-warning` | duration | 90d | 7d to 365d | `fundraising.settings.manage` | staff | No | When to warn of an approaching claim deadline (C6) |
| `fundraising.sponsorship.renewal-notice` | duration | 60d | 7d to 365d | `fundraising.settings.manage` | staff | No | Renewal reminder before a term ends (S2) |
| `fundraising.sponsorship.lapse-after` | duration | 90d | 0d to 365d | `fundraising.settings.manage` | staff | No | An ended sponsorship not renewed becomes lapsed |
| `fundraising.retention.donations` | duration | 2555d (7 years) | 2190d to 3650d | `fundraising.settings.manage`, with confirmation | public | Yes | How long a donor's details are kept on gifts with no Gift Aid hold |
| `fundraising.retention.gift-aid` | duration | 2190d (6 years) | 2190d to 3650d | `fundraising.settings.manage`, with confirmation | public | Yes | How long a declaration is kept after the period of the last gift claimed on it (E2); HMRC's minimum is six years |
| `fundraising.retention.sponsorships` | duration | 2555d (7 years) | 1095d to 3650d | `fundraising.settings.manage`, with confirmation | staff | No | Contact details on ended sponsorships |
| `fundraising.acknowledgement.bands` | list of money | £10, £50, £100, £500 | 2 to 8 rising amounts | `fundraising.settings.manage` | public | No | Band edges for campaigns that show bands beside names (K3); each band runs to the next edge less a penny and the last reads "or more" |
| `fundraising.small-donations.enabled` | boolean | false | Only with Gift Aid on and the penalty confirmation (SD1) | `fundraising.settings.manage`, with confirmation | internal | No | Turns on collections and the Small Donations top-up |
| `fundraising.small-donations.limit` | money | £30 | £1 to £100 | `fundraising.settings.manage`, with confirmation | public | Yes | HMRC's largest single small donation (SD2) |
| `fundraising.small-donations.annual-cap` | money | £8,000 | £0 to £8,000 | `fundraising.settings.manage`, with confirmation | internal | Yes | Small donations claimable in a tax year outside community buildings; lowered to the theatre's share when connected charities share it (SD5, SD7) |
| `fundraising.small-donations.community-buildings` | list of spaces | none | The theatre's own spaces | `fundraising.settings.manage` | internal | No | Spaces that count as community buildings, each with its own limit (SD5) |
| `fundraising.collections.enabled` | on or off | off |  | `fundraising.settings.manage` | internal | No | Lets collections be recorded for another charity (SD8); works with Gift Aid off |
| `fundraising.collections.hand-over-notice` | duration | 30 days | 1 to 365 days | `fundraising.settings.manage` | internal | No | A collection for another charity still held this long raises a health check (SD8) |
| `fundraising.grants.deadline-notice` | duration | 14d | 1d to 90d | `fundraising.settings.manage` | internal | No | How long before a funder's deadline the lead is reminded (GR1) |
| `fundraising.grants.report-notice` | duration | 14d | 1d to 90d | `fundraising.settings.manage` | internal | No | How long before a report is due the lead is reminded (GR6) |
| `fundraising.retention.grants` | duration | 2555d (7 years) | 2190d to 3650d | `fundraising.settings.manage`, with confirmation | public | Yes | How long a grant application's contact details are kept after it closes, is declined or is withdrawn |

The four `checkout` keys ship with FR-14. Groups: `giving`, `checkout`, `desk`, `campaigns` on the Giving tab; `gift-aid` on the Gift Aid tab; `sponsorship` on the Sponsorship tab; `retention` advanced; `small-donations` on the Gift Aid tab; `acknowledgement` on the Giving tab; `grants` on a Grants tab. Funds and the three vocabularies are edited in the same modal, not as settings. No preset differs from the defaults: a charity theatre turns on Gift Aid itself, because it needs its HMRC reference.

Rules checked together: Gift Aid on needs the charity name, HMRC reference, year end and GBP; every preset lies within min and max; min is below max.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `fundraising.donation.view` | `fundraising.donation` | normal | grants | `core.account.find` | See donations and donor names; audited read | Fundraising lead, treasurer |
| `fundraising.donation.take` | site | normal | ignored |  | Take a gift in the till panel | Box office and bar sellers; fact `front-of-house.on-shift` |
| `fundraising.donation.record` | site | privileged | ignored | `donation.view` | Record a gift that arrived by cheque, transfer or elsewhere | Treasurer |
| `fundraising.donation.refund` | `fundraising.donation` | privileged | refuses | `donation.view` | Ask Payments to refund a gift | Treasurer |
| `fundraising.donation.correct` | `fundraising.donation` | privileged | refuses | `donation.view` | Move a gift to another fund or campaign (D7) | Treasurer |
| `fundraising.donation.redact` | `fundraising.donation` | privileged | ignored | `donation.view` | Search unlinked donor rows for erasure | Data protection lead |
| `fundraising.campaign.manage` | `fundraising.campaign` | normal | grants |  | Create, edit, publish and close campaigns | Fundraising lead; a production's marketing lead, granted on the production |
| `fundraising.fund.manage` | site | privileged | ignored |  | Create, edit and archive funds, choose the default | Treasurer |
| `fundraising.declaration.view` | `fundraising.declaration` | privileged | ignored |  | See Gift Aid declarations with names and addresses; `fresh: false`, `audit: 'read'` | Treasurer, Gift Aid officer |
| `fundraising.declaration.manage` | `fundraising.declaration` | privileged | refuses | `declaration.view` | Enter a paper declaration, end or supersede one | Gift Aid officer |
| `fundraising.declaration.redact` | `fundraising.declaration` | privileged | ignored | `declaration.view` | Search unlinked declarations for erasure | Data protection lead |
| `fundraising.claim.prepare` | `fundraising.claim` | privileged | ignored | `declaration.view` | Make and refresh claims, download the schedule (audited) | Gift Aid officer |
| `fundraising.claim.submit` | `fundraising.claim` | privileged | refuses | `claim.prepare` | Record submission and payment; posts to the ledger. Refused to the person who made the claim ready, unless an Owner | Treasurer |
| `fundraising.sponsorship.view` | `fundraising.sponsorship` | normal | grants |  | See sponsorships and benefits | Committee |
| `fundraising.sponsorship.manage` | `fundraising.sponsorship` | normal | grants | `sponsorship.view` | Create and change sponsorships, tick benefits, renew | Sponsorship officer |
| `fundraising.sponsorship.redact` | `fundraising.sponsorship` | privileged | ignored | `sponsorship.view` | Search sponsorship contacts for erasure | Data protection lead |
| `fundraising.settings.manage` | site | privileged | ignored |  | Change Fundraising's settings and vocabularies | Treasurer |
| `fundraising.collection.record` | `fundraising.collection` | normal | grants |  | Count, check and bank collections, and record collections for another charity and their hand-over (SD8); the second counter needs it too | Treasurer; front of house managers |
| `fundraising.grant.view` | `fundraising.grant` | normal | grants |  | See grant applications, awards, payments and reports | Committee |
| `fundraising.grant.manage` | `fundraising.grant` | normal | grants | `fundraising.grant.view` | Create applications, record decisions, payments and reports | Fundraising lead; treasurer |

`fundraising.donation.view` implies `core.account.find`, which Identity declares impliable, so whoever may see donations may search them by a person's name. `claim.submit` is refused to the person who made the claim ready by a guard in the service, giving a second pair of eyes on every claim; an Owner is exempt, as ruled on 23 November 2026.

No facts and no new record-scoped grants beyond the record types in part 4. A grant of `fundraising.campaign.manage` on a production covers campaigns tied to that production only.
