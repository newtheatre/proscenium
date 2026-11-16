# 2. Data model

A form version is one immutable document, and an answer is one row per question, so a form can change freely while every answer keeps its own data class. The module owns sixteen tables, all prefixed `forms_`, and writes to no other module's tables.

## Three choices that shape the model

| Choice | Decision | Why |
| --- | --- | --- |
| Where the shape of a form lives | One JSON definition per version, in one column | A version is then a single immutable value. The reference project stores items and rules as rows and edits them live, which leaves no way to say which form an old response answered ([its schema](https://github.com/MattA-Official/form-builder/blob/main/server/db/schema.ts)) |
| Where answers live | One row per question per response revision | Each answer carries its own data class, so erasure, retention, encryption and filtering work per question. One JSON blob per response, as in the reference project, would need rewriting on every erasure |
| How a question keeps its identity | A row in a field catalogue, with an opaque id and a readable key, shared by every version | The results table has one column per question across versions, and a renamed question does not orphan its answers |

## The form definition

The definition is data, never code. Its shape is described here; the exact schema is written with the engine.

| Part | Holds |
| --- | --- |
| `format` | The definition format number, so the engine can read older forms after an upgrade |
| `pages` | Ordered pages. Each has an id, a title, optional help, its items, and its routing: an ordered list of "when this is true, go to that page or ending" |
| Items | A question, a repeating group of questions, a row of two questions side by side, or content (text or an image) |
| A question | Id, key, type, label, help, options or an option source, `required` (yes, no or a condition), `visibleWhen` (a condition), validation rules each with its own message, prefill source, data class, binding, and who answers it (the respondent or staff) |
| `calculations` | Named values worked out from answers: an id, a result type and an expression tree |
| `endings` | Named closing screens. Each either submits or ends without submitting, with its own message |
| `workflow` | Stages, transitions, the review set-up and outcome actions (tab 3) |
| `payment` | Optional: the amount (fixed or a calculation), the description, and the stage payment gates |
| `presentation` | Progress indicator, button wording, confirmation message, whether a receipt is sent |

A condition is a small tree: groups of `all`, `any` or `none`, nested to a depth a setting limits, over comparisons. Each comparison has a left side, an operator and a right side. A side is an answer, a calculation, a fact about the respondent, an attribute of the record the form is attached to, today's date, or a literal.

A short illustration of the shape, not a schema:

```json
{
  "id": "q_role", "key": "role", "type": "choice.single",
  "label": "Which role are you proposing for?",
  "options": [{ "id": "o1", "label": "Director" }, { "id": "o2", "label": "Producer" }],
  "required": true, "dataClass": "internal"
},
{
  "id": "q_vision", "key": "directors_vision", "type": "text.long",
  "label": "Describe your vision for the show",
  "visibleWhen": { "all": [{ "left": { "answer": "q_role" }, "op": "is", "right": { "option": "o1" } }] },
  "validation": [{ "rule": "maxLength", "value": 3000, "message": "Keep this under 3,000 characters." }],
  "dataClass": "free-text"
}
```

## Tables

Types are SQLite's. Every id is an opaque text identifier. Times are UTC integers. "Class" is the data class from the design paper; "On erasure" says what happens when the person the row is about is erased.

### forms\_forms

One row per form.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `slug` | text, unique, not null | Internal | Kept |
| `title` | text, not null | Internal | Kept |
| `mode` | text, check `submission` or `record` | Internal | Kept |
| `status` | text, check `draft`, `live`, `paused`, `closed`, `archived` | Internal | Kept |
| `live_version_id` | text, references forms\_versions, null until first publish | Internal | Kept |
| `anonymous` | integer boolean, not null, default 0; fixed after first publish | Internal | Kept |
| `retention_days` | integer, null means the module default | Internal | Kept |
| `retention_declined_days` | integer, null means same as `retention_days` | Internal | Kept |
| `template_key` | text, null; the template it began from | Internal | Kept |
| `created_by` | text, references a person | Personal | Set to the anonymised person |
| `created_at`, `archived_at` | integer | Internal | Kept |

### forms\_versions

One row per version. A published row is never updated; a trigger refuses it.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `form_id` | text, references forms\_forms, not null | Internal | Kept |
| `state` | text, check `draft`, `published`, `superseded` | Internal | Kept |
| `number` | integer, null while a draft; unique with `form_id` | Internal | Kept |
| `definition` | text, JSON, not null; size capped by a setting | Internal | Kept |
| `definition_hash` | text, not null | Internal | Kept |
| `format` | integer, not null | Internal | Kept |
| `edit_revision` | integer, not null; raised on every draft save | Internal | Kept |
| `change_summary` | text, JSON; what changed from the previous version and its impact class | Internal | Kept |
| `published_by` | text, references a person, null while a draft | Personal | Set to the anonymised person |
| `published_at` | integer, null while a draft | Internal | Kept |

A partial unique index allows one draft per form. Question labels are the theatre's wording and are classed Internal; a build-time note in the builder tells authors not to put a person's details in a label.

### forms\_fields

The field catalogue: one row per question identity, across all versions of a form. Written at publish.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key; the question id used in definitions | Internal | Kept |
| `form_id` | text, references forms\_forms, not null | Internal | Kept |
| `key` | text, not null; unique with `form_id` | Internal | Kept |
| `type` | text, not null; fixed for the life of the field | Internal | Kept |
| `data_class` | text, check one of the five classes; may only be raised, never lowered | Internal | Kept |
| `binding` | text, null; the bindable attribute it writes to | Internal | Kept |
| `label` | text, not null; the latest label | Internal | Kept |
| `first_version`, `retired_in_version` | integer; the second is null while in use | Internal | Kept |

### forms\_placements

Where a form is offered: a public link, or a slot another module declares.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `form_id` | text, references forms\_forms, not null | Internal | Kept |
| `slot_key` | text, not null; `forms.link` for a standalone link | Internal | Kept |
| `subject_type`, `subject_id` | text, null; the record it is attached to. A null id means every record of that type | Internal | Kept |
| `audience` | text, check `anyone`, `signed_in`, `members`, `group`, `invited` | Internal | Kept |
| `audience_group_id` | text, null; required when audience is `group` | Internal | Kept |
| `opens_at`, `closes_at` | integer, null | Internal | Kept |
| `response_cap` | integer, null | Internal | Kept |
| `response_count` | integer, not null, default 0; check `response_cap` is null or `response_count <= response_cap` | Internal | Kept |
| `one_per_person` | integer boolean, not null | Internal | Kept |
| `edit_after_submit` | text, check `never`, `until_close`, `when_returned` | Internal | Kept |
| `status` | text, check `active`, `paused`, `ended` | Internal | Kept |
| `created_by`, `created_at` | text, integer | Personal, Internal | Person anonymised |

A unique index on (`slot_key`, `subject_type`, `subject_id`, `form_id`) stops the same form being attached twice in one place.

### forms\_invitations

People invited to a placement whose audience is `invited`.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `placement_id` | text, references forms\_placements, not null | Internal | Kept |
| `person_id` | text, references a person, null when invited by address only | Personal | Row deleted |
| `email` | text, null once the person is known | Personal | Row deleted |
| `token_hash` | text, unique, not null | Internal | Row deleted |
| `sent_at`, `used_at` | integer | Internal | Row deleted |

### forms\_responses

One row per response. The id is made by the client before the first save, so a retried submission can never create a second response.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `reference` | text, unique, not null; a short code a person can quote | Internal | Kept |
| `form_id`, `version_id`, `placement_id` | text, references, not null | Internal | Kept |
| `subject_type`, `subject_id` | text, null; the record this response is about | Internal | Kept |
| `person_id` | text, references core.account; null for an anonymous form or a response made while signed out | Personal | Set to null |
| respondent\_email | text, null; the address given by a respondent who is not signed in, declared with the email subject. A check constraint allows person\_id or respondent\_email, never both | Personal | Set to null |
| `entered_by` | text, references a person; set when staff answer on someone's behalf | Personal | Set to the anonymised person |
| `state` | text, check `draft`, `awaiting_payment`, `submitted`, `withdrawn` | Internal | Kept |
| `stage_key` | text, null until submitted; the workflow stage | Internal | Kept |
| `stage_kind` | text, check `pending`, `in_review`, `returned`, `approved`, `declined`, `closed` | Internal | Kept |
| `current_revision` | integer, not null, default 0 | Internal | Kept |
| `unique_key` | text, null; the person id when the placement allows one response each. Unique with `placement_id` | Personal | Set to null |
| `is_test` | integer boolean, not null | Internal | Kept |
| `resume_token_hash` | text, null | Internal | Set to null |
| `submitted_at`, `decided_at`, `created_at`, `updated_at` | integer | Internal | Kept |
| `retention_due_at` | integer, null; set when the response reaches a final stage | Internal | Kept |
| `anonymised_at` | integer, null | Internal | Set to now |

Indexes: (`form_id`, `stage_kind`, `submitted_at`), (`person_id`), (`subject_type`, `subject_id`), (`retention_due_at`). SQLite treats nulls as distinct in a unique index, so `unique_key` enforces one response per person only where it is set.

Three rules from identity (16 November 2026) apply to every table in this tab.

- **A person is an account.** Every `person_id` column references `core.account`, and an account merge moves these columns in its own batch, so forms repoints nothing.
- **A signed-out response is keyed to an address.** Claiming an account does not re-key the row: "My forms" finds it through the account's verified addresses.
- **Access by link uses a token, never an id.** The invitation link and the link to resume a draft are the `token_hash` and `resume_token_hash` columns, stored hashed.

### forms\_response\_drafts

The working copy of an unsubmitted response, or of a returned one being revised. Mutable, and deleted on submission.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `response_id` | text, primary key, references forms\_responses | Internal | Row deleted |
| `answers_cipher` | blob, not null; the answers so far, encrypted in the application | Special category | Row deleted |
| `page_id` | text, null; where the person stopped | Internal | Row deleted |
| `updated_at` | integer | Internal | Row deleted |

The whole draft is encrypted because it can hold any class of answer and is never queried by content.

### forms\_answers

One row per question per revision of a submitted response. Append-only, enforced by trigger; a correction is a new revision.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `response_id` | text, references forms\_responses, not null | Internal | Kept |
| `revision` | integer, not null | Internal | Kept |
| `field_id` | text, references forms\_fields, not null | Internal | Kept |
| `repeat_index` | integer, not null, default 0; the entry within a repeating group | Internal | Kept |
| `data_class` | text, not null; copied from the field at the time of writing | Internal | Kept |
| `value_text` | text, null | Decided per row by `data_class` | Public and Internal kept; Personal replaced by a fixed marker; Personal free text redacted; Special category deleted |
| `value_number` | real or integer, null; money is integer minor units | Decided per row | As `value_text` |
| `value_json` | text, JSON, null; several choices, an address, file ids | Decided per row | As `value_text` |
| `value_cipher` | blob, null; used instead of the three above for special category | Special category | Set to null |
| `label_snapshot` | text, null; the display text of a chosen record or option at the time | Decided per row | As `value_text` |

Primary key (`response_id`, `revision`, `field_id`, `repeat_index`). Index (`field_id`, `value_text`) and (`field_id`, `value_number`) serve filters and charts. Erasure is the one permitted update, made by the erasure service through a guarded path the trigger recognises; foundations is asked how append-only triggers and erasure coexist.

A response to an anonymous form has no person, so erasure cannot find it. That is the point of an anonymous form, and the builder says so when the option is chosen.

### forms\_option\_counts

Places taken on a choice whose options are limited, such as audition slots.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `placement_id`, `field_id`, `option_id` | text, together the primary key | Internal | Kept |
| `cap` | integer, not null | Internal | Kept |
| `taken` | integer, not null, default 0; check `taken <= cap` and `taken >= 0` | Internal | Kept |

### forms\_stage\_history

Every move of a response between stages. Append-only.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `response_id` | text, references forms\_responses, not null | Internal | Kept |
| `from_stage`, `to_stage` | text; the first is null on submission | Internal | Kept |
| `to_kind` | text, not null | Internal | Kept |
| `transition_key` | text, not null | Internal | Kept |
| `actor_id` | text, references a person; null for the system | Personal | Set to the anonymised person |
| `reason` | text, null; the recorded reason for a decision | Personal free text | Redacted when it names the erased person; otherwise kept |
| `at` | integer, not null | Internal | Kept |

### forms\_review\_assignments

Who reviews which response in which round.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `response_id` | text, references forms\_responses, not null | Internal | Kept |
| `round` | integer, not null, default 1 | Internal | Kept |
| `reviewer_id` | text, references a person, not null; unique with `response_id` and `round` | Personal | Set to the anonymised person |
| `state` | text, check `assigned`, `conflicted`, `submitted`, `released` | Internal | Kept |
| `conflict_source` | text, null, check `declared`, `automatic` | Internal | Kept |
| `assigned_at`, `completed_at` | integer | Internal | Kept |

### forms\_reviews

A reviewer's scores and comment. Append-only; a changed review supersedes the earlier one.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `assignment_id` | text, references forms\_review\_assignments, not null | Internal | Kept |
| `scores` | text, JSON; a whole number per criterion | Internal | Kept |
| `recommendation` | text, null, check `approve`, `decline`, `discuss` | Internal | Kept |
| `comment` | text, null | Personal free text | Redacted when the response's submitter is erased |
| `supersedes_id` | text, null, references forms\_reviews | Internal | Kept |
| `submitted_at` | integer, not null | Internal | Kept |

### forms\_messages

Notes among staff on a response, and messages between staff and the submitter. Append-only.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `response_id` | text, references forms\_responses, not null | Internal | Kept |
| `author_id` | text, references a person | Personal | Set to the anonymised person |
| `visibility` | text, check `staff`, `submitter` | Internal | Kept |
| `body` | text, not null | Personal free text | Redacted |
| `at` | integer, not null | Internal | Kept |

### forms\_participation

For an anonymous form that allows one response each: a record that a person has responded, with no link to which response is theirs.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `placement_id`, `person_id` | text, together the primary key | Personal | Row deleted |
| `at` | integer, rounded to the day so it cannot be matched to a response time | Internal | Row deleted |

### forms\_action\_runs

Work a stage change sets off in another module: applying bindings, an outcome action, a payment request. Each is retried until it succeeds or is given up, and never runs twice.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `response_id` | text, references forms\_responses, not null | Internal | Kept |
| `history_id` | text, references forms\_stage\_history | Internal | Kept |
| `action_key` | text, not null | Internal | Kept |
| `idempotency_key` | text, unique, not null | Internal | Kept |
| `state` | text, check `pending`, `done`, `failed`, `abandoned` | Internal | Kept |
| `result_type`, `result_id` | text, null; the record the action created | Internal | Kept |
| `attempts` | integer, not null, default 0 | Internal | Kept |
| `last_error_code` | text, null; a code, never a message with personal detail | Internal | Kept |
| `updated_at` | integer | Internal | Kept |

### forms\_templates

Templates a theatre saves from its own forms. Templates shipped with the platform are files in the module, not rows.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| `id` | text, primary key | Internal | Kept |
| `name`, `description` | text | Internal | Kept |
| `definition` | text, JSON, not null | Internal | Kept |
| `created_by`, `created_at` | text, integer | Personal, Internal | Person anonymised |

## Limits the platform sets

These come from D1 on the Workers Paid plan and bound the settings in tab 6 ([Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), read 16 November 2026).

| D1 limit | Value | Consequence here |
| --- | --- | --- |
| Largest row, string or blob | 2 MB | A definition and a draft are each capped well below it by a setting |
| Bound parameters per query | 100 | Answers are written in chunks; no query binds one parameter per response in a result set |
| Columns per table | 100 | Answers are rows, never a column per question |
| Duration of a query or a whole batch | 30 seconds | A submission is one batch of at most a few hundred small statements; exports run on a queue in pages |

## What is deliberately not stored

- **No IP address or device fingerprint** on a response. Abuse protection is Turnstile and rate limits.
- **No answer to a hidden question.** If logic hides a question, the server discards any value sent for it.
- **No copy of another module's record.** A picker stores the record's id and a label snapshot for display after the record changes.
- **No legacy identifiers**, and nothing shaped by an import.

### forms\_response\_authors

Arrives with the shared-draft story (FB-606), after the first release. The people a submitter has added to a draft response so a team can write a proposal together. It is a list, not a grant: the fact `forms.co-author` reads it, and the rows go when the draft is submitted.

| Column | Type and constraints | Class | On erasure |
| --- | --- | --- | --- |
| id | text, primary key | Internal | Row deleted |
| response\_id | text, references forms\_responses, not null | Internal | Row deleted |
| person\_id | text, references core.account, not null. Unique with response\_id | Personal | Row deleted |
| added\_by | text, references core.account, not null | Personal | Row deleted |
| added\_at | integer, not null | Internal | Row deleted |

## Id prefixes

Foundations amended the id format on 16 November 2026: every id is a prefix, an underscore and 26 characters, and a reference or a route accepts only its own table's prefix. Ids sort by creation time unless marked random, which only hides the moment of creation. An id is never a secret: it appears in logs, audit rows, event payloads and webhooks, so anything that grants access by being known is a separate random token on the row, stored hashed. Foundations checked these prefixes for clashes and entered them in its index.

| Table | Prefix | Random |
| --- | --- | --- |
| `forms_forms` | `frm` | No |
| `forms_versions` | `fver` | No |
| `forms_fields` | `ffld` | No |
| `forms_placements` | `fplc` | No |
| `forms_invitations` | `finv` | Yes, to hide when it was made. The invitation link is a separate token column, stored hashed |
| `forms_responses` | `fres` | No |
| `forms_response_drafts` | `fdr` | Yes, to hide when it was made. The resume link is a separate token column, stored hashed |
| `forms_answers` | `fans` | No |
| `forms_option_counts` | `fopt` | No |
| `forms_stage_history` | `fstg` | No |
| `forms_review_assignments` | `fasg` | No |
| `forms_reviews` | `frev` | No |
| `forms_messages` | `fmsg` | No |
| `forms_participation` | `fpar` | No |
| `forms_action_runs` | `frun` | No |
| `forms_templates` | `ftpl` | No |
| forms\_response\_authors (after the first release) | fcoa | No |
