# 2. Data model

Communications owns nine tables. The first release builds six: lists, consent wordings, subscriptions, consent records, campaigns and campaign recipients. Mailing templates, imports and segments are built with the later stories that need them. The module creates no accounts and stores no name and no delivery outcome. The one piece of personal data it holds is the email address of a person who subscribed without signing in, as an email subject under identity's ruling of 16 November 2026.

## Reading the tables

The layout is the foundations data-class registry's, as core domain uses it: a line of table options, then one row per column. Every table has `created_at`, and `updated_at` where rows change; both are timestamps, internal, kept. A column of type account points at `core_accounts`. Markdown is stored as written and shown through core's one sanitising renderer.

## Id prefixes

| Prefix | Table | Sort |
| --- | --- | --- |
| `cml` | communications\_lists | Time |
| `cwd` | communications\_consent\_wordings | Time |
| `csub` | communications\_subscriptions | Time |
| `ccon` | communications\_consent\_records | Time |
| `cam` | communications\_campaigns | Time |
| `crcp` | communications\_campaign\_recipients | Time |
| `cmt` | communications\_mailing\_templates | Time |
| `cimp` | communications\_imports | Time |
| `cseg` | communications\_segments (later release) | Time |

All nine prefixes are registered by Foundations (ruling N9 in part 4). The manage and confirm links are separate random tokens stored hashed, never a row id.

## Group 1: lists and consent

**communications\_lists**: realm operational; subject none; no retention; not append-only; id prefix `cml`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| key | text | not null, unique, kebab-case | public | keep | Used in sign-up components and imports. Never reused |
| name | text | not null, at most 80 characters | public | keep | Shown to the public |
| description | text | at most 300 characters | public | keep | What a subscriber will receive and how often |
| side | text | not null, one of audience, members | internal | keep | Fixed at creation |
| join\_mode | text | not null, one of open, staff-only, automatic | internal | keep |  |
| source\_key | text | required when automatic | internal | keep | An audience source |
| source\_params | JSON | checked against the source's parameters | internal | keep |  |
| basis | text | not null, one of consent, existing-customer, membership | internal | keep | See part 3 |
| double\_opt\_in | boolean | nullable | internal | keep | Null follows the setting |
| offer\_at\_signup | boolean | not null, default false | internal | keep | Shown by the public sign-up component |
| offer\_at\_checkout | boolean | not null, default false | internal | keep | Contributed to the checkout consent point |
| sender\_key | ref core\_sender\_identities | nullable, restrict | internal | keep | Null follows core's routing for the topic |
| state | text | not null, default active, one of active, archived | internal | keep |  |

Guard on the table: `basis` is `consent` unless `side` is members or `join_mode` is automatic. An open audience list is always consent-based.

**communications\_consent\_wordings**: realm operational; subject none; no retention; append-only; id prefix `cwd`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| list\_id | ref communications\_lists | not null, restrict | internal | keep |  |
| locale | text | not null | internal | keep |  |
| version | integer | not null, greater than 0; (list\_id, locale, version) unique | internal | keep |  |
| text | text | not null, at most 400 characters | public | keep | The sentence beside the tick box |
| published\_by | account, role actor, on merge alias | nullable | internal | keep |  |

The newest version for a list and locale is the one shown. That is worked out, not stored, so a consent record can always point at the exact words. This is the pattern of `core_notification_templates`.

**communications\_subscriptions**: realm from `side`; subject `account_id` or `email`, exactly one on each row; no retention; not append-only; on erasure the row is deleted; id prefix `csub`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| list\_id | ref communications\_lists | not null, restrict | internal | keep |  |
| account\_id | account, role subject, on merge handler | nullable; (list\_id, account\_id) unique where set | internal | clear | Set when the person subscribed signed in |
| email | email | nullable; (list\_id, email) unique where set; exactly one of account\_id, email | personal | clear | Set when the person subscribed signed out, was imported, or was added by address. Stored trimmed and lower-cased |
| locale | text | not null | internal | keep | For an email subject, the language of the page they signed up on |
| side | text | not null, one of audience, members | internal | keep | Copied from the list |
| state | text | not null, one of pending, subscribed, unsubscribed | personal | clear |  |
| source | text | not null, a code | internal | keep | signup, checkout, account, form, staff, import |
| confirm\_token\_hash | text | unique where set | internal | clear | Cleared on confirmation |
| confirm\_expires\_at | timestamp |  | internal | keep |  |
| manage\_token\_hash | text | not null, unique | internal | clear | Behind the manage link |
| subscribed\_at, unsubscribed\_at | timestamp |  | internal | keep |  |
| unsubscribe\_reason | text | a code | internal | keep | link, mail-client, account, staff, topic-off, complaint |

A members' list takes account subjects only: a member is always an account. An email-subject row is never turned into an account row. When its owner later proves the address to identity, identity finds the row by that address for My account, download and erasure, and nothing moves.

Index: (list\_id, state). On an automatic list a row exists only for someone who has opted out, with state unsubscribed.

**communications\_consent\_records**: realm from `side`; subject `account_id` or `email`, exactly one on each row until erasure; retention `communications.consent.record-retention`; append-only except erasure; id prefix `ccon`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| list\_id | ref communications\_lists | not null, restrict | internal | keep |  |
| account\_id | account, role subject, on merge alias | nullable | internal | clear |  |
| email | email | nullable | personal | clear | As on the subscription |
| side | text | not null | internal | keep |  |
| action | text | not null, one of requested, granted, withdrawn, expired | internal | keep |  |
| source | text | not null, a code | internal | keep | As on the subscription, plus link, mail-client, topic-off, merge |
| wording\_id | ref communications\_consent\_wordings | nullable, restrict | internal | keep | Required for requested and granted on a consent list |
| origin\_type, origin\_id | text |  | internal | keep | The order, response or import it came from. No reference |
| actor\_id | account, role actor, on merge alias | nullable | internal | keep | Set when staff or an import acted for the person |
| statement | text | at most 500 characters | free text | redact | The staff member's attestation on an import or a manual add |

Index: (account\_id, list\_id, created\_at). The retention clock starts when the subscription it belongs to ends.

## Group 2: campaigns

**communications\_campaigns**: realm operational; subject none; no retention; not append-only; id prefix `cam`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| kind | text | not null, one of mailing, notice | internal | keep | Fixed at creation |
| side | text | not null, one of audience, members | internal | keep | From the list or the source |
| name | text | not null, at most 120 characters | internal | keep | Staff's own label, never sent |
| list\_id | ref communications\_lists | required for a mailing, restrict | internal | keep |  |
| audience | JSON | checked against each source's parameters | internal | keep | `{ include: [{ source, params }], exclude: [...] }`. A notice has exactly one include |
| about\_type, about\_id | text |  | internal | keep | The record a notice concerns, such as a performance. No reference |
| reason | text | required for a notice, a code | internal | keep | change, access, safety, schedule, other |
| subject | text | required to leave draft, at most 150 characters | internal | keep |  |
| preheader | text | at most 150 characters | internal | keep |  |
| body | text | markdown with declared blocks and merge fields only | internal | keep | Frozen once sending starts |
| channels | JSON | not null; a subset of the type's allowed channels | internal | keep |  |
| sender\_key | ref core\_sender\_identities | nullable, restrict | internal | keep |  |
| template\_id | ref communications\_mailing\_templates | nullable, set null | internal | keep | Where the content started |
| state | text | not null, one of draft, in-review, scheduled, preparing, sending, paused, sent, cancelled | internal | keep | Part 3 |
| scheduled\_for | timestamp |  | internal | keep |  |
| created\_by, approved\_by, sent\_by | account, role actor | nullable | internal | keep |  |
| started\_at, finished\_at | timestamp |  | internal | keep |  |
| recipients\_total, handed\_count, excluded\_count | integer | not null, default 0 | internal | keep | Kept as the snapshot is worked |
| result | JSON |  | internal | keep | Final counts by delivery state, copied from core when the campaign finishes |

Index: (state, scheduled\_for). The body is internal, not public: a mailing may say things meant only for its list.

**communications\_campaign\_recipients**: realm from `side`; subject `account_id` or `email`, exactly one on each row until erasure; retention `communications.campaigns.recipient-retention`; not append-only; id prefix `crcp`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| campaign\_id | ref communications\_campaigns | not null, cascade | internal | keep |  |
| account\_id | account, role subject, on merge handler | nullable; (campaign\_id, account\_id) unique where set | internal | clear | The row stays for the counts |
| email | email | nullable; (campaign\_id, email) unique where set | personal | clear | For an email-subject subscriber or source |
| locale | text | not null | internal | keep |  |
| side | text | not null | internal | keep |  |
| state | text | not null, one of pending, handed, excluded | internal | keep |  |
| reason | text | a code | internal | keep | Why excluded: left-list, topic-off, unreachable, duplicate, cancelled |
| tranche\_no | integer | not null | internal | keep |  |
| handed\_at | timestamp |  | internal | keep |  |

Index: (campaign\_id, state, tranche\_no). What happened after hand-over is not stored here: it is the delivery row core holds for the notification whose dedupe key is `communications.campaign:<campaign id>:<recipient id>`.

**communications\_mailing\_templates**: realm operational; subject none; no retention; not append-only; id prefix `cmt`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| name | text | not null, unique among active | internal | keep |  |
| kind | text | not null, one of mailing, notice | internal | keep |  |
| subject, preheader | text |  | internal | keep |  |
| body | text | not null, markdown | internal | keep |  |
| state | text | not null, default active, one of active, retired | internal | keep |  |
| updated\_by | account, role actor | nullable | internal | keep |  |

A campaign copies a mailing template when it is created and has no link back that matters, so editing a template never changes a campaign.

## Group 3: import (later)

**communications\_imports**: realm operational; subject none; retention `communications.imports.file-retention` for the file, the row is kept; not append-only; id prefix `cimp`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| list\_id | ref communications\_lists | not null, restrict | internal | keep |  |
| file\_id | ref core\_files | nullable, set null | internal | keep | Slot `communications.import` / `source` |
| state | text | not null, one of uploaded, checked, running, done, failed, cancelled | internal | keep |  |
| statement | text | not null, at most 500 characters | free text | keep | How and when these people agreed. About the theatre's process, not a person |
| reconfirm | boolean | not null | internal | keep | True makes every imported subscription pending |
| rows\_total, added, already, invalid, unreachable | integer | not null, default 0 | internal | keep |  |
| started\_by | account, role actor | nullable | internal | keep |  |

The import's rows are never stored. The job reads the file, writes subscriptions and consent records, and the file is purged after the retention period.

## Later release

**communications\_segments** (`cseg`): a saved, named narrowing (`audience` JSON as on a campaign) that campaigns may copy. Operational, no personal data.

## File slots this module declares

| Record type | Slot | Holds | Access | Limit |
| --- | --- | --- | --- | --- |
| communications.campaign | images | Many images | Public | Core's image limit |
| communications.import | source | One CSV | Record | Core's document limit |

Images in an email must be fetchable by a mail client without sign-in, so the slot is public. Alt text is required.

## What needs no table

- **Delivery outcomes.** Sent, bounced, complained and failed are core's delivery rows, counted by `deliveryCounts` with the campaign as the subject record.
- **Suppression.** Core's, by keyed hash. Asked through `emailReachability` for accounts; for an email subject core applies it at send time.
- **Accounts and names.** Identity's. This module never creates an account, and holds no name for an email subject.
- **Membership of an automatic list.** Worked out from its audience source at send time.
- **Topics and notification types.** Declared in the manifest.

## Tables that only grow

`communications_consent_wordings` is append-only. `communications_consent_records` is append-only except erasure, under the foundations ruling of 16 November 2026 that an append-only table may have erasable columns.

## When a person is erased

In the one batch identity's erasure runs:

| Table | What happens |
| --- | --- |
| communications\_subscriptions | Rows deleted: those for the account, and email-subject rows for every address verified on it |
| communications\_consent\_records | `account_id` and `email` cleared, `statement` redacted. The row remains as a count |
| communications\_campaign\_recipients | `account_id` and `email` cleared |

No erasure hold is contributed: nothing here must outlive the person. Core's suppression hash is what stops later mail to the address, including from a re-import.

## When two accounts are merged

| Table | Rule |
| --- | --- |
| communications\_subscriptions | Handler. Where both accounts have a row for a list, the row changed most recently wins and the other is deleted; an unsubscribed row always beats a pending one. A consent record with source merge is written |
| communications\_consent\_records | Alias, as append-only tables must |
| communications\_campaign\_recipients | Handler. Moved, unless the survivor already has a row for that campaign, in which case the loser's `account_id` is cleared |
