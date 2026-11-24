# 2. Data model

Companies owns 13 tables, all prefixed `companies_`, in Foundations' layout (data-class registry). Every table also has `created_at` and, unless append-only, `updated_at`; they are internal, kept on erasure and left out of the lists. Money is integer minor units with a currency column; every date and time is stored as a timestamp and shown in the theatre's time zone.

## Id prefixes

Checked against every prefix declared in `layers/*` and every spec on `next` (23 November 2026): none of these is taken. All are time-sorted. To be registered with Foundations through the Integration thread.

| Prefix | Table | Holds |
| --- | --- | --- |
| `cpy` | `companies_companies` | An outside organisation |
| `cpc` | `companies_contacts` | One person acting for one company |
| `cpe` | `companies_engagements` | One company's dealings for one production or hire |
| `cpev` | `companies_engagement_events` | The history of an engagement |
| `cpa` | `companies_agreements` | One version of an engagement's terms |
| `cpar` | `companies_agreement_responses` | A contact accepting or declining a version |
| `cpca` | `companies_calls` | A get-in, technical, dress, get-out or other call |
| `cpp` | `companies_people` | A person from the company in the building |
| `cpg` | `companies_allocations` | Guest places for one performance |
| `cpgu` | `companies_guests` | One named guest |
| `cps` | `companies_settlements` | One version of a settlement |
| `cpsl` | `companies_settlement_lines` | One line of a settlement |
| `cpsp` | `companies_settlement_payments` | Money recorded against a settlement when Invoices is off |

## Record types

`companies.company`, `companies.contact`, `companies.engagement`, `companies.agreement`, `companies.allocation`, `companies.settlement`. Abilities act on these (part 6); a grant or fact may be scoped to a company or an engagement.

## Companies

**`companies_companies`**: realm operational; subject `individual_account_id` when set, else none; no retention; not append-only. A private hirer (a birthday party) is a company with `individual` true, so its name and address follow the person on erasure. This is the one use of `col.perRow`: the same columns are an organisation's public facts on most rows and a private person's data on a few.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, 1 to 160, unique among unarchived rows ignoring case | per row (`data_class`) | anonymise when personal | How staff know it |
| `public_name` | text | at most 160 | per row | anonymise when personal | Shown on productions; null means `name`. Kept in step with core's `company_name` (rule G3) |
| `legal_name` | text | at most 200 | per row | clear when personal | For agreements and invoices |
| `registration` | text | at most 60 | internal | keep | Company or charity number |
| `tax_number` | text | at most 30 | internal | keep | VAT number, for invoices |
| `address` | text | at most 400, lines separated by newlines | per row | clear when personal | Postal address |
| `postcode` | text | at most 12 | per row | clear when personal |  |
| `country` | text | ISO 3166 alpha-2, default the theatre's | internal | keep |  |
| `invoice_email` | text | an email address | per row | clear when personal | Where Invoices sends documents |
| `website` | text | `https://` only, at most 300 | public | keep |  |
| `description` | text | at most 600 | public | keep | Short public text, offered to the production page |
| `individual` | boolean | not null, default false | internal | keep | A private person hiring |
| `individual_account_id` | account | subject; required when `individual` | internal | keep (the account is anonymised) | Merge: alias |
| `data_class` | text | `public` or `personal`; `personal` exactly when `individual` | internal | keep | The per-row class |
| `notes` | text | at most 4000 | personal free text | redact | Staff only |
| `archived_at` | timestamp |  | internal | keep | Archived companies sit below the list's divider |
| `merged_into_id` | ref `companies_companies` | set only by a merge; then archived | internal | keep | Rule G5 |

**`companies_contacts`**: realm operational; subject `account_id`; retention `companies.contacts.keep-for` after `ended_at`; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `company_id` | ref `companies_companies` | not null | internal | keep |  |
| `account_id` | account | not null, subject; unique with `company_id` among rows with no `ended_at` | internal | keep (row ended) | Merge: alias; two rows for one company after a merge collapse to the older |
| `role` | text | at most 80 | internal | keep | "Producer", "Tour manager" |
| `is_primary` | boolean | not null, default false; one primary per company among live rows | internal | keep | Gets everything when no one else is set to |
| `receives` | text | JSON set of `schedule`, `agreement`, `guests`, `settlement`; not null | internal | keep | Which messages go to them |
| `day_phone` | text | at most 30 | personal | clear | Shown to the venue manager on the day |
| `ended_at` | timestamp |  | internal | keep | A contact who leaves is ended, never deleted |
| `added_by` | account | actor | internal | keep | Merge: alias |

## Engagements

**`companies_engagements`**: realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `company_id` | ref `companies_companies` | not null | internal | keep |  |
| `kind` | text | `visiting`, `act`, `hire` | internal | keep | Fixed: each changes behaviour (part 3) |
| `production_id` | text | a core production id; unique among engagements not `cancelled`; required for `visiting` and `act` | internal | keep | Opaque reference, as Finance's entries carry it |
| `season_id` | text | a core season id | internal | keep | For a hire with no production, and for the tray reader |
| `title` | text | not null, 1 to 160 | internal | keep | Defaults to the production's title; a private hire's own label |
| `state` | text | `enquiry`, `offered`, `agreed`, `confirmed`, `completed`, `settled`, `cancelled` | internal | keep | Part 3 |
| `venue_contact_id` | account | actor role; nullable | internal | keep | The theatre's person the company deals with. Merge: alias |
| `tech_notes` | text | at most 8000, Markdown | internal | keep | Agreed technical notes, shown to the contact |
| `arrival_notes` | text | at most 2000 | internal | keep | Parking, stage door, keys |
| `rider_file_ids` | text | JSON array of core file ids | internal | keep | Rider, plans, risk assessment |
| `deposit_minor` | money | at least 0 | internal | keep | From the agreement; hire and visiting |
| `deposit_state` | text | `none`, `due`, `held`, `returned`, `kept`, `part-kept` | internal | keep |  |
| `deposit_intent_id` | text | a Payments intent id | internal | keep |  |
| `currency` | currency | not null, default the theatre's | internal | keep |  |
| `source_ref` | text | `programme-planning:<entry id>` or null | internal | keep | Where it came from |
| `cancel_reason` | text | at most 500; required when `cancelled` | internal | keep |  |
| `created_by` | account | actor | internal | keep | Merge: alias |

**`companies_engagement_events`**: realm operational; subject none; append-only (trigger). One row per state change, agreement sent or answered, allocation change, settlement step; the engagement's History tab reads it.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `kind` | text | from a fixed list of 22 (part 3, moves table) | internal | keep |  |
| `from_state`, `to_state` | text |  | internal | keep |  |
| `detail` | text | JSON of ids and figures only; no free text (decision 0011) | internal | keep |  |
| `actor_id` | account | actor; nullable for the system | internal | keep | Merge: alias |
| `at` | timestamp | not null | internal | keep |  |

## Agreements

**`companies_agreements`**: realm operational; subject none; append-only (trigger): a change is a new version that supersedes, never an edit (decision 0010's pattern).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `version` | integer | not null, 1 upwards, unique with `engagement_id` | internal | keep |  |
| `supersedes_id` | ref `companies_agreements` | the previous version | internal | keep |  |
| `deal_type` | text | `split`, `guarantee`, `guarantee-or-split`, `hire`, `none` | internal | keep |  |
| `company_share_bp` | integer | 0 to 10000 basis points; required for the split types | internal | keep | 7000 is 70% to the company |
| `share_basis` | text | `net-of-fees`, `gross`; required for the split types | internal | keep | Whether booking fees come off first (rule S3) |
| `guarantee_minor` | money | at least 0; required for the guarantee types | internal | keep |  |
| `hire_fee_minor` | money | at least 0; required for `hire` | internal | keep |  |
| `hire_fee_basis` | text | `flat`, `per-performance`, `per-hour` | internal | keep |  |
| `deposit_minor` | money | at least 0 | internal | keep |  |
| `guest_places` | integer | 0 to 50, per performance | internal | keep | Rule A4 |
| `guest_names_due` | duration | default `companies.guests.names-due` | internal | keep | Before each performance |
| `settle_within` | duration | default `companies.settlements.due-within` | internal | keep | After the last performance |
| `clauses` | text | at most 20000, Markdown | internal | keep | Anything else, in words |
| `file_id` | text | core file id; a signed paper contract | internal | keep |  |
| `state` | text | `draft`, `sent`, `accepted`, `declined`, `superseded`, `withdrawn` | internal | keep | The only column a trigger lets change, and only along part 3's moves |
| `sent_at` | timestamp |  | internal | keep |  |
| `created_by` | account | actor | internal | keep | Merge: alias |

**`companies_agreement_responses`**: realm operational; subject `responder_id`; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `agreement_id` | ref `companies_agreements` | not null; one response per version | internal | keep |  |
| `answer` | text | `accepted`, `declined` | internal | keep |  |
| `responder_id` | account | subject; a live contact of the company at the time | internal | keep | Merge: alias |
| `on_behalf_of` | text | the company's legal name as shown, copied | internal | keep | What they accepted for |
| `recorded_by` | account | actor; differs from responder when staff record a paper signature | internal | keep |  |
| `at` | timestamp | not null | internal | keep |  |

## On the day

**`companies_calls`**: realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `kind` | text | `get-in`, `technical`, `dress`, `get-out`, `other` | internal | keep |  |
| `space_id` | text | a core space id | internal | keep |  |
| `starts_at`, `ends_at` | timestamp | not null; ends after starts | internal | keep |  |
| `label` | text | at most 80; required for `other` | internal | keep |  |
| `notes` | text | at most 1000 | internal | keep | Shown to the contact |

**`companies_people`**: realm operational; subject `account_id` when set, else unlinked for staff; retention `companies.people.keep-for` after the engagement's last date; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `account_id` | account | subject; nullable | internal | keep | Merge: alias |
| `name` | text | not null, 1 to 120 | personal | anonymise |  |
| `role` | text | at most 80 | internal | keep | "Lighting operator" |
| `under_18` | boolean | not null, default false | personal | clear | For the venue's safeguarding rules |
| `added_by` | account | actor | internal | keep | A contact or staff |

## Guests

**`companies_allocations`**: realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `performance_id` | text | core performance id; unique with `engagement_id` | internal | keep |  |
| `places` | integer | 0 to 50 | internal | keep | From the agreement; staff may change one performance |
| `hold_ref` | text | Box office's staff hold id | internal | keep | Places held while unnamed |
| `names_due_at` | timestamp | not null | internal | keep |  |
| `state` | text | `open`, `closed`, `released` | internal | keep | Closed at the deadline; released returns unnamed places |

**`companies_guests`**: realm audience; subject `account_id`; retention follows Box office's orders; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `allocation_id` | ref `companies_allocations` | not null | internal | keep |  |
| `account_id` | account | subject; an unclaimed account made from name and email when new | internal | keep | Merge: alias |
| `places` | integer | 1 to the allocation's places | internal | keep | One guest may bring a plus-one |
| `order_ref` | text | Box office's order id once issued | internal | keep |  |
| `state` | text | `named`, `issued`, `withdrawn` | internal | keep |  |
| `named_by` | account | actor | internal | keep |  |

## Settlements

**`companies_settlements`**: realm operational; subject none; not append-only, but every figure column is frozen by trigger once `state` leaves `draft`. A changed figure after that is a new version superseding the old.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `engagement_id` | ref `companies_engagements` | not null | internal | keep |  |
| `version` | integer | not null, unique with `engagement_id` | internal | keep |  |
| `supersedes_id` | ref `companies_settlements` |  | internal | keep |  |
| `agreement_id` | ref `companies_agreements` | the accepted version it applies | internal | keep |  |
| `statement_as_of` | timestamp | not null | internal | keep | When Finance's figures were read |
| `gross_minor` | money |  | internal | keep | Ticket income for the production |
| `fees_minor` | money |  | internal | keep | Booking fees kept by the theatre |
| `refunds_minor` | money |  | internal | keep |  |
| `basis_minor` | money |  | internal | keep | What the share is taken of (rule S3) |
| `balance_minor` | money | not null | internal | keep | Positive: the theatre owes; negative: the company owes |
| `currency` | currency | not null | internal | keep |  |
| `state` | text | `draft`, `proposed`, `agreed`, `queried`, `approved`, `paid`, `superseded`, `void` | internal | keep |  |
| `query_note` | text | at most 2000 | personal free text | redact | A contact's query |
| `prepared_by` | account | actor | internal | keep |  |
| `approved_by` | account | actor; never `prepared_by` (rule S7) | internal | keep |  |
| `agreed_by` | account | a live contact, or staff recording agreement given elsewhere | internal | keep |  |
| `posting_id` | text | Finance posting id | internal | keep |  |
| `invoice_ref` | text | Invoicing's invoice id | internal | keep |  |

**`companies_settlement_lines`**: realm operational; subject none; append-only once the settlement leaves `draft` (trigger).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `settlement_id` | ref `companies_settlements` | not null | internal | keep |  |
| `kind` | text | `company-share`, `guarantee-top-up`, `hire-fee`, `charge`, `deposit-kept`, `adjustment`, `note` | internal | keep |  |
| `label` | text | not null, at most 120 | internal | keep |  |
| `amount_minor` | money | not null; zero only for `note` | internal | keep | Signed like the balance |
| `source_ref` | text | `<module>:<id>` for a contributed charge or note | internal | keep |  |
| `posts` | boolean | false for `note` | internal | keep | Notes (Budgets' awards) never post |
| `sort` | integer |  | internal | keep |  |

**`companies_settlement_payments`**: realm operational; subject none; append-only. Used only while Invoices is off.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `settlement_id` | ref `companies_settlements` | not null | internal | keep |  |
| `direction` | text | `out` (to the company), `in` | internal | keep |  |
| `amount_minor` | money | greater than 0 | internal | keep |  |
| `method` | text | `bank-transfer`, `cheque`, `payments` | internal | keep | `payments` carries the intent id |
| `reference` | text | at most 80 | internal | keep | Bank reference |
| `intent_id` | text | Payments intent id | internal | keep |  |
| `posting_id` | text | Finance posting id | internal | keep |  |
| `recorded_by` | account | actor | internal | keep |  |

## Ledger accounts

Declared through `finance.system-account`, made locked when the module is switched on.

| Key | Kind | Used for |
| --- | --- | --- |
| `companies.company-share` | expense | The company's share of box office income (and guarantee top-ups) |
| `companies.payable` | liability | Owed to companies |
| `companies.receivable` | asset | Owed by companies and hirers |
| `companies.hire-income` | income | Hire fees |
| `companies.deposits-held` | liability | Deposits taken and not yet returned or kept |
| `companies.other-income` | income | Deposits kept, adjustments in the theatre's favour |
| `companies.paid-out` | asset | Payments out recorded by hand while Invoices is off, cleared in the accounting export |
