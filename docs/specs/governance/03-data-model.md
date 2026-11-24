# 2. Data model

Governance owns eighteen tables (four for meetings, added after Matt's answer to question 6), all prefixed `governance_`, in Foundations' layout. Every table also has `created_at` and, unless append-only, `updated_at`; both are internal and kept on erasure, and are left out of the lists. Dates written `date` are theatre-local `YYYY-MM-DD` text, compared as strings (decision 0014's rule). Account references are `col.account` with `onMerge: 'alias'` unless stated.

## Id prefixes

Checked on 23 November 2026 against every prefix in `docs/specs` and `layers/*` on `next`; none is taken. To register with Foundations' part 4 index. All are time-sorted.

| Prefix | Table | Holds |
| --- | --- | --- |
| `gvb` | `governance_bodies` | A governing body |
| `gvp` | `governance_posts` | A post in a body |
| `gvt` | `governance_terms` | One person in one post for a time |
| none | `governance_term_ends` | The end of a term; keyed by `term_id` |
| none | `governance_term_listings` | How a term shows publicly; keyed by `term_id` |
| `gvc` | `governance_post_checklist_items` | A handover checklist line a post carries every year |
| `gvh` | `governance_handover_packs` | One post's pack for one committee year |
| `gvi` | `governance_handover_items` | A checklist line in one pack |
| `gvn` | `governance_handover_notes` | A note the outgoing holder writes |
| none | `governance_handover_sections` | A contributed section, snapshotted; keyed by `pack_id`, `section` |
| `gvd` | `governance_documents` | An entry in the register |
| `gdv` | `governance_document_versions` | One file of a document |
| `gvs` | `governance_sign_offs` | An approval or a no-change review of a version |
| `gvf` | `governance_feedback` | A feedback report |

Added for meetings on 24 November 2026: `gvm` (meetings), `gva` (agenda items) and `gvx` (actions); attendance is keyed by (`meeting_id`, `account_id`) and takes no prefix. Checked the same way; none is in use.

## Bodies and posts

**`governance_bodies`**: realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, unique among live rows, at most 60 | public | keep | "Committee", "Board of trustees" |
| `description` | text | at most 500 | public | keep | Shown above the body on the public page |
| `listed` | boolean | not null, default true | internal | keep | Whether the public page shows the body |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | An archived body takes no new terms |

**`governance_posts`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `body_id` | ref `governance_bodies` | not null | internal | keep |  |
| `key` | text | not null, unique, lower-case slug, at most 40 | internal | keep | Used by content tokens: `treasurer` |
| `name` | text | not null, at most 80 | public | keep | "Treasurer" |
| `description` | text | at most 1000 | public | keep | What the post does; the constitution clause if the theatre likes |
| `role_address` | text | email, at most 254 | public | keep | A post's own address, never a person's. Shown publicly |
| `seats` | integer | not null, 1 to 20, default 1 | internal | keep |  |
| `electable` | boolean | not null, default false | internal | keep | Offered to Elections as a subject |
| `term_rule` | text | not null; `year_end`, `days`, `open` | internal | keep | What end a new term gets when none is given |
| `term_days` | integer | 1 to 3650; set exactly when `term_rule` is `days` | internal | keep | Check constraint as `core_roles` |
| `requirements` | JSON | not null, default empty list | internal | keep | Opaque `core.requirement` references a holder must meet when the term is recorded, such as Membership's holder fact |
| `listed` | boolean | not null, default true | internal | keep | Whether the public page shows the post |
| `sort_order` | integer | not null | internal | keep | Order within the body: constitution order |
| `archived_at` | timestamp | nullable | internal | keep |  |

## Terms

**`governance_terms`**: realm members; subject `account_id`; no retention; **append-only**. Ending a term is a row in `governance_term_ends`, as `core_grants` and `core_grant_ends` work, so the history answers who held what on any date.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `post_id` | ref `governance_posts` | not null | internal | keep |  |
| `account_id` | account | not null; role subject; onMerge alias | internal | keep | The row stays; the listing is anonymised |
| `capacity` | text | not null; `elected`, `appointed`, `co-opted`, `acting` | internal | keep |  |
| `starts_on` | date | not null | internal | keep | In office from the start of this day |
| `ends_on` | date | nullable, not before `starts_on` | internal | keep | Planned last day. Null only for a post whose rule is `open` |
| `source` | text | nullable, at most 120 | internal | keep | Opaque `<record type>:<id>`, such as `elections.result:elr_…`, resolved through `core.record-resolver` |
| `recorded_by` | account | not null; role actor | internal | keep |  |

Indexes: (`post_id`, `starts_on`), (`account_id`), (`ends_on`).

**`governance_term_ends`**: realm members; subject via `term_id`; **append-only**; key `term_id`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `term_id` | ref `governance_terms` | primary key | internal | keep |  |
| `ended_on` | date | not null, not before the day before the term's `starts_on` | internal | keep | Last day in office |
| `reason` | text | not null; `resigned`, `removed`, `replaced`, `recorded-in-error`, `other` | internal | keep | No free text: a reason is never a personal note |
| `ended_by` | account | nullable; role actor | internal | keep | Null when a task ended it |

**`governance_term_listings`**: realm members; subject via `term_id`; not append-only; key `term_id`. How a term shows on the public page. Absent means not shown by name.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `term_id` | ref `governance_terms` | primary key | internal | keep |  |
| `show_name` | boolean | not null, default false | internal | keep | The holder's agreement, given by the holder or recorded by staff with the holder's word |
| `display_name` | text | at most 80 | personal | anonymise | Defaults to the account's display name when shown |
| `bio` | text | at most 600 | personal free text | redact | Optional line for the public page |
| `agreed_by` | account | nullable; role actor | internal | keep | Who set `show_name` |

A photo is a core file, owner type `governance.term`, slot `photo`, public access; erasure deletes it through core's file rules.

## Handover

**`governance_post_checklist_items`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `post_id` | ref `governance_posts` | not null | internal | keep |  |
| `text` | text | not null, at most 200 | internal | keep | "Change the bank mandate" |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep |  |

**`governance_handover_packs`**: realm members; subject `outgoing_account_id`; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `post_id` | ref `governance_posts` | not null | internal | keep |  |
| `year_from` | date | not null | internal | keep | First day of the committee year the pack hands over into. Unique with `post_id` |
| `term_id` | ref `governance_terms` | nullable | internal | keep | The outgoing term. Null when the post was vacant |
| `outgoing_account_id` | account | nullable; role subject | internal | keep |  |
| `incoming_term_id` | ref `governance_terms` | nullable | internal | keep | Set when a term starting on or after `year_from` is recorded |
| `state` | text | not null; `open`, `ready`, `received` | internal | keep |  |
| `ready_at` | timestamp | nullable | internal | keep |  |
| `received_at` | timestamp | nullable | internal | keep |  |
| `received_by` | account | nullable; role actor | internal | keep |  |

**`governance_handover_items`**: realm members; subject via `pack_id`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `pack_id` | ref `governance_handover_packs` | not null | internal | keep |  |
| `text` | text | not null, at most 200 | internal | keep | Copied from the post's checklist when the pack opens, or added to this pack only |
| `done_at` | timestamp | nullable | internal | keep |  |
| `done_by` | account | nullable; role actor | internal | keep |  |
| `sort_order` | integer | not null | internal | keep |  |

**`governance_handover_notes`**: realm members; subject via `pack_id`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `pack_id` | ref `governance_handover_packs` | not null | internal | keep |  |
| `heading` | text | not null, at most 100 | internal | keep | "Suppliers", "What I'd do differently" |
| `body` | text | not null, at most 20,000 | personal free text | redact | Markdown. Erasing the author redacts it; erasing someone named in it is a staff redaction (`governance.handover.redact`) |
| `author_id` | account | not null; role actor | internal | keep |  |
| `sort_order` | integer | not null | internal | keep |  |

Table option `redact: 'governance.handover.redact'`, as Foundations requires for free text about people with no account.

**`governance_handover_sections`**: realm members; subject via `pack_id`; key (`pack_id`, `section`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `pack_id` | ref `governance_handover_packs` | not null | internal | keep |  |
| `section` | text | not null | internal | keep | The contribution id, `<module>.<name>` |
| `blocks` | JSON | not null | internal | keep | The section's blocks as rendered when the pack was marked ready. Aggregates and links only, never personal data (the point's contract) |
| `taken_at` | timestamp | not null | internal | keep |  |

## Document register

**`governance_documents`**: realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `kind` | text | not null | internal | keep | A kind id from `governance.document-kind`, such as `governance.policy`, `productions.risk-assessment` |
| `title` | text | not null, at most 120 | internal | keep | Titles name things, not people (the edit form says so) |
| `summary` | text | at most 500 | internal | keep |  |
| `record_type` | text | nullable | internal | keep | Set when the kind attaches to a record, such as `core.production` |
| `record_id` | text | nullable; set exactly with `record_type` | internal | keep | Opaque; resolved through `core.record-resolver` |
| `owner_post_id` | ref `governance_posts` | nullable | internal | keep | Owner by office: survives a change of holder |
| `owner_account_id` | account | nullable; role subject; onMerge alias | internal | keep | Owner by person. Check: exactly one owner column set |
| `review_every_days` | integer | nullable, 1 to 3650 | internal | keep | Overrides the kind's period; null takes the kind's |
| `next_review_on` | date | nullable | internal | keep | Set from the latest sign-off. Null for a kind with no review |
| `visibility` | text | not null; `staff`, `members`, `public`; default `staff` | internal | keep | Who may read the current version, beyond those with `document.view` |
| `policy_id` | text | nullable | internal | keep | A `core.policy` id when the document tracks a public policy page |
| `retired_at` | timestamp | nullable | internal | keep |  |
| `retired_by` | account | nullable; role actor | internal | keep |  |

Indexes: (`record_type`, `record_id`, `kind`), (`next_review_on`), (`owner_post_id`), (`owner_account_id`). The document's state (draft, current, review due, lapsed, retired) is derived on read from these columns and its versions; it is stored nowhere.

**`governance_document_versions`**: realm operational; subject none; **append-only**.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `document_id` | ref `governance_documents` | not null | internal | keep |  |
| `number` | integer | not null, unique with `document_id`, from 1 | internal | keep | Written by a conditional insert: one more than the highest |
| `file_id` | ref `core_files` | not null | internal | keep | Owner type `governance.document`, slot `version`; access follows the document's visibility |
| `policy_version_id` | ref `core_policy_versions` | nullable | internal | keep | For a document tracking a policy, the version reviewed, instead of a file. Check: `file_id` or this |
| `change_note` | text | at most 500 | internal | keep | "Updated for the new venue" |
| `uploaded_by` | account | not null; role actor | internal | keep |  |

**`governance_sign_offs`**: realm operational; subject none; **append-only**.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `version_id` | ref `governance_document_versions` | not null | internal | keep |  |
| `kind` | text | not null; `approved`, `reviewed-unchanged` | internal | keep | A review with no change signs the current version again and moves the review date |
| `account_id` | account | not null; role actor | internal | keep |  |
| `capacity` | text | at most 80 | internal | keep | The post the signer held at the time, copied as text so it reads right after the term ends |
| `signed_at` | timestamp | not null | internal | keep |  |

## Feedback

**`governance_feedback`**: realm operational; subject `reporter_id`; retention `governance.feedback.keep-for`; not append-only (state changes, as NNT's 0086 found).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `reporter_id` | account | not null; role subject; onMerge alias | internal | keep |  |
| `kind` | text | not null; `bug`, `idea` | internal | keep |  |
| `body` | text | not null, 1 to 4000 | personal free text | redact |  |
| `page_path` | text | not null, at most 500 | internal | keep | Path only; the query string is dropped before saving |
| `shell` | text | not null; `console`, `live`, `members` | internal | keep |  |
| `module` | text | nullable | internal | keep | The module owning the page, from the route |
| `user_agent` | text | at most 400 | personal | clear |  |
| `recent_failures` | JSON | default empty list | internal | clear | Up to 10 recent failed requests: method, path, status, time. No bodies |
| `state` | text | not null; `new`, `acknowledged`, `forwarded`, `done`, `dismissed`; default `new` | internal | keep |  |
| `forwarded_ref` | text | nullable, at most 500 | internal | keep | A tracker link someone pasted or a webhook receiver wrote back |
| `triage_note` | text | at most 1000 | personal free text | redact | Staff's note |
| `handled_by` | account | nullable; role actor | internal | keep |  |
| `handled_at` | timestamp | nullable | internal | keep |  |
| send_words_upstream | boolean | not null; default false | internal | keep | The reporter's tick (GV-30); only ever true on a bug |
| upstream_state | text | not null; not_sent, queued, sent, failed; default not_sent | internal | keep | queued only when governance.feedback.upstream was on at sending |
| upstream_ref | text | nullable, at most 500 | internal | keep | The upstream project's reference or link, as its intake returned it |

Check: `state = 'new'` exactly when `handled_at` is null. Index (`state`, `created_at`).

## Meetings

In the first release by Matt's answer to question 6 (24 November 2026). Minutes are not a table: they are a register document of kind `governance.minutes` attached to the meeting, so they get versions, sign-off and a review history from the register.

**`governance_meetings`** (`gvm`): realm operational; no subject; not append-only (a meeting moves through its states).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `body_id` | id | not null; references `governance_bodies` | internal | keep |  |
| `kind` | text | not null; `ordinary`, `annual`, `extraordinary` | internal | keep |  |
| `title` | text | not null, 1 to 200 | internal | keep |  |
| `starts_at` | timestamp | not null | internal | keep | Shown in theatre time |
| `ends_at` | timestamp | not null; after `starts_at` | internal | keep |  |
| `space_id` | id | nullable | internal | keep | A space reference, never read from Spaces' tables |
| `place` | text | nullable, at most 200 | internal | keep | Free text when there is no space |
| `online_link` | text | nullable, https only, at most 500 | internal | keep |  |
| `state` | text | not null; `draft`, `agenda_sent`, `held`, `minutes_approved`, `cancelled`; default `draft` | internal | keep |  |
| `late_notice_reason` | text | nullable, at most 500 | internal | keep | Required when the agenda goes out inside `meetings.agenda-notice` |
| `quorum_met` | boolean | nullable | internal | keep | Set when the meeting is marked held and the body has a quorum |
| `minutes_document_id` | id | nullable; the `governance.minutes` document | internal | keep |  |
| `cancel_reason` | text | nullable, at most 500 | internal | keep |  |
| `created_by` | account | not null; role actor | internal | keep |  |

Indexes: (`body_id`, `starts_at`), (`state`, `starts_at`). The body gains one nullable column, `quorum` (1 to 50, at most its seats in total), checked when a meeting is marked held, and one nullable column, `minutes_post_id`, the post that owns the body's minutes (for NNT, the Secretary).

**`governance_meeting_items`** (`gva`): realm operational; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `meeting_id` | id | not null | internal | keep |  |
| `position` | integer | not null | internal | keep | Drag order |
| `standard` | text | nullable; `apologies`, `last_minutes`, `matters_arising` | internal | keep | The three items every agenda starts with |
| `title` | text | not null, 1 to 200 | internal | keep |  |
| `presenter_post_id` | id | nullable | internal | keep | One of post or person, or neither |
| `presenter_account_id` | account | nullable | internal | keep |  |
| `notes` | text | at most 4000; Markdown | personal free text | redact | Papers and background for the item |
| `reserved` | boolean | not null; default false | internal | keep | Reserved business: hidden from the agenda sent to non-members and left out of public minutes |

**`governance_meeting_attendance`**: realm members; subject `account_id`; key (`meeting_id`, `account_id`); not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `meeting_id` | id | not null | internal | keep |  |
| `account_id` | account | not null; role subject | internal | keep |  |
| `expected` | boolean | not null | internal | keep | True for holders when the agenda was sent |
| `status` | text | not null; `expected`, `apologies`, `present`, `absent` | internal | keep |  |
| `recorded_by` | account | nullable; role actor | internal | keep | The holder for apologies, a manager otherwise |

Guests with no account are a list of names in the minutes, not rows here.

**`governance_actions`** (`gvx`): realm operational; subject the owning account when there is one; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `body_id` | id | not null | internal | keep |  |
| `meeting_id` | id | nullable | internal | keep | Null when added between meetings |
| `item_id` | id | nullable | internal | keep |  |
| `words` | text | not null, 1 to 1000 | personal free text | redact |  |
| `owner_post_id` | id | nullable | internal | keep | Exactly one of post or person |
| `owner_account_id` | account | nullable; role subject | internal | keep |  |
| `due_on` | date | nullable | internal | keep |  |
| `state` | text | not null; `open`, `done`, `dropped`; default `open` | internal | keep |  |
| `closed_by` | account | nullable; role actor | internal | keep |  |
| `closed_at` | timestamp | nullable | internal | keep | Check: null exactly when `state = 'open'` |
| `close_note` | text | at most 500 | personal free text | redact |  |

Indexes: (`owner_account_id`, `state`), (`owner_post_id`, `state`), (`body_id`, `state`, `due_on`).

## Merge and erasure, in short

- **Merge.** Every account column aliases; no table needs a merge handler. Two overlapping terms of one post held by the two merged accounts stay two rows; the post page shows one person twice and the seats check counts the survivor once (it counts distinct accounts in the account scope).
- **Erasure.** Terms, ends and packs stay: they are the theatre's history and hold nothing personal. The listing's name is anonymised ("Former member"), the bio redacted and the photo deleted. Notes the person wrote are redacted; their feedback is redacted and its user agent cleared. Sign-offs keep the anonymised actor so a document's history stays whole. Attendance rows stay with the account anonymised, so a meeting's numbers and quorum stay true; actions keep their owner anonymised and their words redacted.
- **Privacy record.** Two entries to `core.privacy-record`: the public committee listing (basis: the holder's agreement) and feedback reports (basis: legitimate interest in fixing the system; kept for `governance.feedback.keep-for`).
