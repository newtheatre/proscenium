# 2. Data model

Thirteen tables, all prefixed `fundraising_`: twelve in the first release and one later. Id prefixes start with `g` for giving; none is in Foundations' index or in the built schemas as of merge 654, and Integration should enter them in the index. Money is integer minor units with a currency column beside it, as everywhere. Fundraising reads no other module's tables: a production, a season, a company, an invoice or a payment is held as an id and named through `core.record-resolver`.

| Table | Prefix | Release | Holds |
| --- | --- | --- | --- |
| `fundraising_funds` | `gfd` | First | Where gifts go |
| `fundraising_campaigns` | `gcp` | First | Appeals with targets and pages |
| `fundraising_donations` | `gdn` | First | Every gift |
| `fundraising_declarations` | `gdc` | First | Gift Aid declarations (append-only) |
| `fundraising_declaration_ends` | keyed by declaration | First | When a declaration stopped (append-only) |
| `fundraising_claims` | `gcl` | First | Gift Aid claims to HMRC |
| `fundraising_claim_lines` | keyed by claim, donation, kind | First | What each claim contains |
| `fundraising_sponsorships` | `gsp` | First | Sponsorships |
| `fundraising_sponsorship_benefits` | `gsb` | First | Benefits owed to a sponsor |
| `fundraising_regular_gifts` | `grg` | Later | Monthly or yearly gifts |
| `fundraising_collections` | `gco` | First | Bucket and small contactless collections for the Small Donations Scheme |
| `fundraising_grant_applications` | `gga` | First | Applications to funders and their outcome |
| `fundraising_grant_reports` | `ggr` | First | Reports owed to a funder after an award |

## Funds

**`fundraising_funds`**: id prefix `gfd`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null; unique among active funds | public | keep | "General fund", "Roof appeal" |
| `purpose` | text | nullable | public | keep | Shown on the donate page; required when restricted |
| `restricted` | boolean | not null, default false | internal | keep | Cannot change once a donation is received into it |
| `is_default` | boolean | not null; exactly one active fund is default (partial unique index) | internal | keep | Where a gift with no fund or campaign goes |
| `offered` | boolean | not null, default true | internal | keep | Listed for donors to choose on the donate page |
| `state` | text | `active`, `archived` | internal | keep | The default fund cannot be archived |
| `sort` | integer | not null | internal | keep |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

Each fund has its own ledger accounts, made in the unit that creates the fund with `ensureScopedAccount` (part 4). A fund is never deleted.

## Campaigns

**`fundraising_campaigns`**: id prefix `gcp`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `slug` | text | unique; kebab-case | public | keep | `/support/<slug>` |
| `title` | text | not null | public | keep |  |
| `summary` | text | not null; at most 200 characters | public | keep | Card and share text |
| `body` | text | nullable; Markdown, rendered with the site's safe renderer | public | keep |  |
| `image_file_id` | ref `core_files` | nullable | internal | keep | Uploaded through core's files |
| `fund_id` | ref `fundraising_funds` | not null | internal | keep | Every gift to the campaign goes to this fund |
| `production_id` | id of `core.production` | nullable | internal | keep | Shown on the production's page |
| `season_id` | id of `core.season` | nullable | internal | keep |  |
| `target_minor` | minor units | nullable; CHECK > 0 | internal | keep | No target: no progress bar |
| `currency` | currency | not null | internal | keep |  |
| `offset_minor` | minor units | not null, default 0; CHECK >= 0 | internal | keep | Raised outside the platform and added to the total, with a note |
| `offset_note` | text | required when offset is above 0 | internal | keep |  |
| `opens_at` | timestamp | not null | internal | keep |  |
| `closes_at` | timestamp | nullable; after opens\_at | internal | keep | No end: open until closed by hand |
| `state` | text | `draft`, `open`, `closed`, `archived` | internal | keep | Part 3 |
| `show_total` | boolean | not null, default from setting | internal | keep | Raised and target on the public page |
| `count_gift_aid` | boolean | not null, default from setting | internal | keep | Gift Aid claimed or claimable counts toward raised |
| `list_names` | boolean | not null, default false | internal | keep | Show the names of donors who chose to be named (K3) |
| `list_amounts` | text | not null, default `none`; one of `none`, `band`, `exact` | internal | keep | With `list_names` on, what appears beside the name of a donor who allowed it: nothing, the band from `fundraising.acknowledgement.bands`, or the amount (K3) |
| `target_reached_at` | timestamp | nullable; set once | internal | keep | Announces `fundraising.campaign.target-reached` |
| `created_by` | account, actor | not null | internal | keep | On merge: alias |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

## Donations

**`fundraising_donations`**: id prefix `gdn`; realm audience; subject `account_id`, or `contact_email` where there is no account, unlinked rows for staff (redact ability `fundraising.donation.redact`); retention `fundraising.retention.donations`; not append-only, but a guard trigger refuses any change to `amount_minor`, `currency`, `fund_id`, `channel` or `received_on` once the state is `received`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `reference` | text | unique; set on receipt | internal | keep | The donor's reference, such as `G-4821` |
| `account_id` | account, subject | nullable | internal | keep | On merge: alias |
| `contact_email` | email | nullable | personal | anonymise | For a donor with no account |
| `donor_name` | text | nullable | personal | anonymise | As given; required for Gift Aid, otherwise optional |
| `company_id` | id of `companies.company` | nullable | internal | keep | A gift from an organisation. Never eligible for Gift Aid |
| `organisation_name` | text | nullable | internal | keep | Where Companies is off |
| `amount_minor` | minor units | not null; CHECK > 0 | internal | keep |  |
| `currency` | currency | not null | internal | keep |  |
| `fund_id` | ref `fundraising_funds` | not null | internal | keep |  |
| `campaign_id` | ref `fundraising_campaigns` | nullable | internal | keep | Its fund must equal fund\_id |
| `production_id` | id of `core.production` | nullable | internal | keep | Copied from the campaign, or from the order it rode with |
| `channel` | text | `online`, `checkout`, `till`, `recorded`, `collection`, `regular` | internal | keep | `collection` is a banked bucket collection (SD3); `regular` is later |
| `how_received` | text | `card`, `cash`, `cheque`, `bank-transfer`, `elsewhere`; required when recorded | internal | keep | For a gift recorded by staff |
| `received_on` | local date | nullable until received | internal | keep | The theatre's date the money arrived; Gift Aid's donation date |
| `state` | text | `pending`, `received`, `abandoned`, `refunded` | internal | keep | Part 3 |
| `refunded_minor` | minor units | not null, default 0; CHECK between 0 and amount | internal | keep | A part refund leaves the state received |
| `intent_id` | id of a Payments intent | nullable; unique when pending | internal | keep | Null for a recorded gift paid by cheque or transfer |
| `part_id` | id of a Payments intent part | nullable; unique | internal | keep |  |
| `rode_with` | text | nullable; `<module>:<record>` | internal | keep | The checkout payment's other owner, such as `box-office:ord_…` |
| `acknowledge_as` | text | nullable; at most 60 characters | public | anonymise | How the donor wants to be named; null is "Anonymous" |
| `show_amount` | boolean | not null, default false | public | clear | The donor ticked the separate box allowing their amount or band to appear beside their name (K3); never set by staff |
| `sds_status` | text | not null, default `none`; one of `none`, `eligible`, `claimed`, `excluded` | internal | keep | Small Donations Scheme status of a gift with no Gift Aid declaration (SD1 to SD4) |
| `message` | text | nullable; at most 500 characters | free text | redact | A note to the theatre. Never public |
| `has_benefit` | boolean | not null, default false | internal | keep | The donor received something for it. Blocks Gift Aid in the first release (rule G4) |
| `gift_aid` | text | `none`, `eligible`, `claimed`, `adjusted`, `ineligible` | internal | keep | Part 3 |
| `gift_aid_reason` | text | nullable; a code such as `no-declaration`, `organisation`, `benefit`, `too-late` | internal | keep | Why it is not claimable |
| `declaration_id` | ref `fundraising_declarations` | nullable | internal | keep | The declaration that covers it, set when it becomes eligible |
| `recorded_by` | account, actor | nullable | internal | keep | Staff who recorded or took it. On merge: alias |
| `posting_id` | id of a Finance posting | nullable | internal | keep | The settle posting, for tracing |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

A donation's money record lives in Payments and Finance; this row is what a charity needs about the gift. Erasure anonymises the donor but keeps the amount, fund and dates, because the accounts need them. A donation on a claimed Gift Aid line keeps `donor_name` and the declaration until the Gift Aid retention ends (rule E2).

## Gift Aid declarations

**`fundraising_declarations`**: id prefix `gdc`; realm audience; subject `account_id`, or `contact_email` where there is no account, unlinked rows for staff (redact ability `fundraising.declaration.redact`); retention `fundraising.retention.gift-aid`, counted from the last claimed donation it covers (rule E2); append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | account, subject | nullable | internal | keep | On merge: alias |
| `contact_email` | email | nullable | personal | retain | Until the Gift Aid retention ends |
| `title` | text | nullable; at most 4 characters | personal | retain | HMRC's schedule limit |
| `first_name` | text | not null; at most 35 characters | personal | retain |  |
| `last_name` | text | not null; at most 35 characters | personal | retain |  |
| `house` | text | not null | personal | retain | House name or number |
| `postcode` | text | nullable; capitals with a space | personal | retain | Null only with `overseas` |
| `address` | text | nullable | personal | retain | The rest of the address, for the donor's own record |
| `overseas` | boolean | not null, default false | personal | retain | A UK taxpayer living abroad; HMRC takes "X" for postcode |
| `kind` | text | `single`, `enduring` | internal | keep |  |
| `donation_id` | ref `fundraising_donations` | required when single; unique | internal | keep |  |
| `covers_from` | local date | not null | internal | keep | Enduring: the made-on date, or 6 April four tax years before if the donor ticked "past four years" |
| `made_on` | local date | not null | internal | keep |  |
| `method` | text | `online`, `paper`, `oral` | internal | keep | `oral` is later (question 7) |
| `wording_version` | text | not null | internal | keep | Hash of the declaration `wording the donor saw (see below)` |
| `evidence_file_id` | ref `core_files` | nullable | internal | keep | A scanned paper form |
| `record_sent_at` | timestamp | nullable | internal | keep | Oral only: the written record was sent; not effective before |
| `supersedes_id` | ref `fundraising_declarations` | nullable | internal | keep | A new address or name supersedes the old declaration, which is ended in the same unit |
| `recorded_by` | account, actor | nullable | internal | keep | Staff entering a paper form. On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

The declaration text is not stored per row. Each version of the wording is a content page in the theatre's site (`content/policies/gift-aid-declaration.md`, quoting `fundraising.gift-aid.charity-name` by token), and `wording_version` is the hash Nuxt Content gives that page's body when the donor submitted. Changing the wording therefore never rewrites what an earlier donor agreed to, and the page's history in Git is the archive.

**`fundraising_declaration_ends`**: keyed by `declaration_id`; realm audience; subject inherited, `via: declaration_id`; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `declaration_id` | ref `fundraising_declarations` | primary key | internal | keep | One ending per declaration |
| `ends_on` | local date | not null; on or after made\_on | internal | keep | Donations received on or after it are not covered |
| `reason` | text | `donor-cancelled`, `superseded`, `not-a-taxpayer`, `entered-in-error` | internal | keep |  |
| `recorded_by` | account, actor | nullable | internal | keep | Null when the donor cancelled it themselves. On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

## Gift Aid claims

**`fundraising_claims`**: id prefix `gcl`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `number` | integer | unique; one more than the highest | internal | keep | Shown as "Claim 12" |
| `state` | text | `draft`, `ready`, `submitted`, `paid`, `cancelled` | internal | keep | Part 3 |
| `up_to` | local date | not null | internal | keep | Donations received up to and including this date |
| `rate_percent` | integer | not null | internal | keep | Copied from `fundraising.gift-aid.rate-percent` when the claim is made ready |
| `line_count` | integer | not null; at most 1,000 after aggregation | internal | keep | HMRC's limit for one schedule |
| `donations_minor` | minor units | not null | internal | keep | Sum of its lines' amounts, adjustments included |
| `claimed_minor` | minor units | not null | internal | keep | The Gift Aid asked for |
| `currency` | currency | not null | internal | keep | Always GBP; Gift Aid cannot be on unless the currency is GBP |
| `hmrc_reference` | text | required when submitted | internal | keep | The submission reference Charities Online gives |
| `submitted_on` | local date | required when submitted | internal | keep |  |
| `submitted_by` | account, actor | nullable | internal | keep | On merge: alias |
| `paid_on` | local date | required when paid | internal | keep |  |
| `paid_minor` | minor units | required when paid | internal | keep | May differ from claimed if HMRC adjusts; the difference is posted |
| `note` | text | nullable | internal | keep | HMRC's queries and answers. Never about a person |
| `created_by` | account, actor | not null | internal | keep | On merge: alias |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |
| `sds_tax_year` | text | nullable; `YYYY-YY` | internal | keep | The tax year whose small donations this claim tops up (SD5); null when the claim has none |
| `sds_total_minor` | integer | not null, default 0 | internal | keep | Small donations claimed on, after the limits of SD5 |
| `sds_topup_minor` | integer | not null, default 0 | internal | keep | The top-up asked for: `sds_total_minor` times `rate_percent` / 100, rounded down |

The schedule spreadsheet is never stored. It is built when downloaded, from the lines and the declarations, so personal data lives only in the declarations table and its retention.

**`fundraising_claim_lines`**: keyed by `claim_id`, `donation_id` and `kind`; realm operational; subject none; append-only once its claim is submitted (a trigger refuses a change to a line of a submitted claim).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `claim_id` | ref `fundraising_claims` | not null | internal | keep |  |
| `donation_id` | ref `fundraising_donations` | not null | internal | keep |  |
| `kind` | text | `claim`, `adjustment` | internal | keep | An adjustment is a refund after an earlier claim |
| `amount_minor` | minor units | not null; negative for an adjustment | internal | keep | The donation, less any refund before the claim |
| `tax_minor` | minor units | not null | internal | keep | Rounded down to the penny per line |
| `aggregate` | integer | nullable | internal | keep | The aggregated schedule line it falls in, for gifts of £20 or less |
| `declaration_id` | ref `fundraising_declarations` | not null | internal | keep | The covering declaration, fixed at the claim |
| `created_at` | timestamp | not null | internal | keep |  |

A donation appears on at most one `claim` line across claims that are not cancelled (partial unique index) and on at most one `adjustment` line.

## Sponsorships

**`fundraising_sponsorships`**: id prefix `gsp`; realm operational; subject `contact_email`, unlinked rows for staff (redact ability `fundraising.sponsorship.redact`); retention `fundraising.retention.sponsorships`, counted from the end of the term; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `company_id` | id of `companies.company` | nullable | internal | keep | Repointed on `companies.company.merged` |
| `sponsor_name` | text | not null | public | keep | An organisation's name; copied from the company, kept for when Companies is off |
| `contact_name` | text | nullable | personal | anonymise | Only where Companies is off; otherwise the company's contacts |
| `contact_email` | email | nullable | personal | anonymise | As above |
| `level_term_id` | ref `core_terms` | nullable | internal | keep | Vocabulary `fundraising.sponsor-level`: headline, production, supporting |
| `covers` | text | `theatre`, `season`, `production` | internal | keep |  |
| `season_id` | id of `core.season` | required when covers season | internal | keep |  |
| `production_id` | id of `core.production` | required when covers production | internal | keep |  |
| `amount_minor` | minor units | not null; CHECK >= 0 | internal | keep | 0 for support in kind |
| `in_kind` | text | nullable | internal | keep | What is given in place of money |
| `currency` | currency | not null | internal | keep |  |
| `starts_on`, `ends_on` | local date | not null; ends after starts | internal | keep |  |
| `state` | text | `proposed`, `agreed`, `active`, `ended`, `lapsed`, `withdrawn` | internal | keep | Part 3 |
| `renewal_of_id` | ref `fundraising_sponsorships` | nullable | internal | keep | The previous term |
| `invoice_id` | id of an `invoicing` invoice | nullable | internal | keep |  |
| `received_minor` | minor units | not null, default 0 | internal | keep | From `invoicing.invoice.paid` or a bank receipt |
| `acknowledge` | boolean | not null, default true | internal | keep | Name and logo may appear publicly |
| `logo_file_id` | ref `core_files` | nullable | internal | keep |  |
| `link` | text | nullable; https only | public | keep | The sponsor's website |
| `looked_after_by` | account, actor | nullable | internal | keep | The person who manages the relationship; gets renewal reminders. On merge: alias |
| `note` | text | nullable | free text | redact |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

**`fundraising_sponsorship_benefits`**: id prefix `gsb`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `sponsorship_id` | ref `fundraising_sponsorships` | not null | internal | keep |  |
| `kind_term_id` | ref `core_terms` | not null | internal | keep | Vocabulary `fundraising.benefit-kind`: programme credit, website logo, foyer logo, tickets, event invitation, named seat, other |
| `detail` | text | nullable | internal | keep | "Full page in the spring programme" |
| `quantity` | integer | not null, default 1; CHECK > 0 | internal | keep | Tickets, invitations |
| `due_on` | local date | nullable | internal | keep |  |
| `delivered_at` | timestamp | nullable | internal | keep |  |
| `delivered_by` | account, actor | nullable | internal | keep | On merge: alias |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

## Small donations

**`fundraising_collections`**: id prefix `gco`; realm operational; subject none; retention `fundraising.retention.gift-aid`, counted from the end of the tax year claimed in. A counted bucket or tin collection: either for the Gift Aid Small Donations Scheme, or, when beneficiary\_name is set, cash collected for another charity (SD8), whose retention counts from collected\_on instead. Small till gifts need no table of their own: they are donations whose `sds_status` says whether they count.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | text | primary key, `gco_` + 26 | internal | keep | Collection id |
| `collected_on` | date | not null | internal | keep | The day the money was collected, Europe/London |
| `performance_id` | text | nullable | internal | keep | The performance it was collected at, if any, as an opaque id named through `core.record-resolver` |
| `space_id` | text | nullable | internal | keep | Where it was collected; decides the community building limit (SD5) |
| `fund_id` | text | references funds; not null unless beneficiary\_name is set, then null | internal | keep | Where the money goes |
| `total_minor` | integer | not null, at least 0 | internal | keep | Everything counted |
| `over_limit_minor` | integer | not null, default 0, at most `total_minor` | internal | keep | Notes or cheques above the per-gift limit found in the count; never in the scheme (SD2) |
| `currency` | text | not null | internal | keep | Always GBP while the scheme is on |
| `counted_by_id` | text | not null; account id | operational | alias | First counter |
| `checked_by_id` | text | not null; account id, not the first counter | operational | alias | Second counter (SD3) |
| `banked_on` | date | nullable | internal | keep | Set when the money is recorded through Payments' bank receipt service |
| `donation_id` | text | nullable, references donations | internal | keep | The donation with channel `collection` made when banked |
| `beneficiary_name` | text | nullable; at most 120 characters | internal | keep | The charity the money was collected for; set means the collection is not NNT income (SD8) |
| `handed_over_on` | date | nullable; only with beneficiary\_name | internal | keep | When the money was passed to the charity, Europe/London |
| `created_at` | integer | not null | internal | keep | Recorded |

When a collection is banked, Fundraising records it through Payments' bank receipt service as one donation with channel `collection`, no donor, `gift_aid_status` `none` and `sds_status` `eligible` for the total less `over_limit_minor`; the over-limit part is a second donation with `sds_status` `excluded`. So every penny raised is a donation and the funds, totals and ledger need nothing new.

A collection for another charity is never banked through Payments: `banked_on` and `donation_id` stay empty, nothing posts to the ledger, and it never counts in the theatre's totals, figures, measures or any claim (SD8). It is a record of money held on someone else's behalf, kept so the two counters and the hand-over are on file.

## Grant applications

**`fundraising_grant_applications`**: id prefix `gga`; realm operational; subject none (an organisation is not a data subject; the contact's name and email are personal); retention `fundraising.retention.grants`, counted from the last report or the decision.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | text | primary key, `gga_` + 26 | internal | keep | Application id |
| `title` | text | not null; at most 120 characters | internal | keep | What the money is for, as the funder will see it |
| `funder_company_id` | text | nullable | internal | keep | The funder as a `companies.company`, when Companies is on |
| `funder_name` | text | not null; at most 120 characters | internal | keep | Copied from the company or typed; kept if the company is merged away |
| `contact_name` | text | nullable | personal | anonymise | The funder's contact |
| `contact_email` | text | nullable | personal | anonymise | The funder's contact |
| `fund_id` | text | not null, references funds | internal | keep | Where an award is credited (GR5); usually a restricted fund |
| `production_id` | text | nullable | internal | keep | A production the money is for, as an opaque id |
| `lead_id` | text | not null; account id | operational | alias | Who is writing it |
| `state` | text | not null; one of `planned`, `drafting`, `submitted`, `awarded`, `declined`, `withdrawn`, `closed` | internal | keep | Part 3, Grant applications |
| `deadline_at` | integer | nullable | internal | keep | The funder's deadline, Europe/London |
| `asked_minor` | integer | nullable until submitted, then not null | internal | keep | What was asked for |
| `awarded_minor` | integer | not null when awarded | internal | keep | What the funder awarded |
| `received_minor` | integer | not null, default 0 | internal | keep | Payments recorded against the award (GR5) |
| `currency` | text | not null | internal | keep | As everywhere |
| `submitted_on` | date | nullable | internal | keep | When it went to the funder |
| `decided_on` | date | nullable | internal | keep | When the funder's answer came |
| `conditions` | text | nullable; at most 2,000 characters | internal | keep | What the award must be spent on and any conditions |
| `files` | text | JSON list of file ids | internal | keep | The application and award letter, held by Foundations' file store |
| `created_at`, `updated_at` | integer | not null | internal | keep | Times |

**`fundraising_grant_reports`**: id prefix `ggr`; realm operational; subject none; deleted with its application's retention.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | text | primary key, `ggr_` + 26 | internal | keep | Report id |
| `application_id` | text | not null, references grant applications | internal | keep | Which award it belongs to |
| `kind` | text | not null; one of `interim`, `final`, `financial`, `other` | internal | keep | What the funder asked for |
| `due_on` | date | not null | internal | keep | The funder's date |
| `state` | text | not null; one of `due`, `sent`, `waived` | internal | keep | GR6 |
| `sent_on` | date | nullable | internal | keep | When it went |
| `sent_by_id` | text | nullable; account id | operational | alias | Who sent it |
| `note` | text | nullable; at most 500 characters | internal | keep | What was sent, or why it was waived |

A grant payment is not a donation row: it posts to `fundraising.grant-income` for the fund (M7) and raises `received_minor`. Grants never carry Gift Aid (G2).

## Later tables

**`fundraising_regular_gifts`** (id prefix `grg`; realm audience; subject `account_id`; retention `fundraising.retention.donations`): account, amount, currency, fund, frequency (`monthly`, `yearly`), the Payments mandate id, state (`active`, `paused`, `ended`, `failed`), next due date, the declaration covering it. Each collection makes an ordinary donation with channel `regular`. Specified in full when Payments has a recurring capability (question 5).

## Indexes that carry rules

| Index | Rule |
| --- | --- |
| `fundraising_funds (is_default) WHERE is_default = 1 AND state = 'active'`, unique | One default fund |
| `fundraising_donations (part_id)`, unique | One donation per payment part |
| `fundraising_declarations (donation_id) WHERE kind = 'single'`, unique | One single declaration per donation |
| `fundraising_claim_lines (donation_id, kind)`, unique, over lines whose claim is not cancelled (maintained by a trigger, as D1 has no partial index across a join) | A donation is claimed once and adjusted once |
| `fundraising_campaigns (slug)`, unique | One page per address |
| `fundraising_donations (account_id, received_on)`, `(contact_email)`, `(campaign_id, state)`, `(fund_id, received_on)` | Donor history, campaign totals and fund reports |
