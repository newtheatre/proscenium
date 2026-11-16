# 2. Data model

Core owns 26 tables in six groups, and the public site module owns none: it only reads. The final list of tables with their id prefixes is at the end of this tab.

## Reading the tables

Every table is written in the layout the foundations data-class registry fixes: a line of table options, then one row for each column.

- **Table options.** Realm (audience, members or operational), subject (how a row reaches the person it is about, or none), retention, whether it is append-only, and its id prefix.
- **Types.** id, ref, account, text, integer, boolean, timestamp (UTC milliseconds), local date (`YYYY-MM-DD` in the theatre's time zone), JSON.
- **Class.** public, internal, personal, free text, special, or per row.
- **On erasure.** keep, anonymise, redact or clear, as the foundations format defines them.
- **Accounts.** A column of type account points at `core_accounts`, which workstream 2 defines. Role subject means the row is about that person. Role actor means the person did something to the row: the reference is kept and follows a merge, and the account itself is anonymised by workstream 2.
- **Left out to save space.** Every table has `created_at`, and `updated_at` where rows change. Both are timestamps, internal, kept.
- **Markdown** columns are stored as written and shown through one sanitising renderer. No column stores HTML.

## Group 1: programme

**`core_seasons`**: realm operational; subject none; no retention; not append-only; id prefix `sea`.

A season is a dated label that groups productions.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `slug` | text | not null, unique | public | keep |  |
| `name` | text | not null, unique ignoring case | public | keep |  |
| `starts_on` | local date | not null | public | keep |  |
| `ends_on` | local date | not null, on or after `starts_on` | public | keep | May equal the start. Proscenium's check is strictly greater, which its known issues list as a fault. |
| `summary` | text | markdown | public | keep |  |
| `state` | text | not null, default `draft`, one of `draft`, `published`, `archived` | internal | keep | See part 3 |
| `sort` | integer | not null, default 0 | internal | keep |  |

**`core_productions`**: realm operational; subject none; no retention; not append-only; id prefix `prd`.

The centre of the model. A production is anything the theatre puts in front of people: its own show, a visiting company's, a hire, or an event such as a workshop.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `slug` | text | not null, unique | public | keep | Also unique against every slug in `core_production_slugs` |
| `title` | text | not null, 1 to 200 characters | public | keep |  |
| `subtitle` | text |  | public | keep |  |
| `summary` | text | at most 300 characters, plain text | public | keep | Required to publish |
| `description` | text | markdown | public | keep |  |
| `kind` | text | not null, one of `own`, `visiting`, `hire`, `event` | internal | keep |  |
| `category_term_id` | ref `core_terms` | nullable, restrict; vocabulary `core.production-category` | public | keep | Required to publish |
| `season_id` | ref `core_seasons` | nullable, set null | public | keep | One season or none (question 2) |
| `company_name` | text |  | public | keep | The presenting company, for a visiting show or a hire |
| `age_guidance` | text | at most 40 characters | public | keep |  |
| `advisories_confirmed_none` | boolean | not null, default false | public | keep | Separates "nobody has looked" from "nothing to warn about". Proscenium has the same idea. |
| `content_note` | text | markdown | public | keep |  |
| `running_minutes` | integer | greater than 0 | public | keep | Starting value for its performances |
| `interval_count` | integer | not null, default 0, not negative | public | keep |  |
| `external_booking_url` | text | HTTPS only, never empty | public | keep | Used when no module supplies a booking action |
| `credits_public` | boolean | not null; starts from `core.programme.credits-public` | internal | keep | Question 5 |
| `state` | text | not null, default `draft`, one of `draft`, `published`, `withdrawn`, `cancelled` | internal | keep | See part 3 |
| `cancel_reason_term_id` | ref `core_terms` | nullable, restrict; vocabulary `core.cancel-reason`; set exactly when cancelled | public | keep |  |
| `listed` | boolean | not null, default true | internal | keep | False keeps a published production out of lists and feeds while its page still answers |
| `published_at` | timestamp |  | internal | keep |  |
| `first_starts_at` | timestamp |  | public | keep | Earliest performance that is not a draft |
| `last_ends_at` | timestamp |  | public | keep | Latest performance that is neither a draft nor cancelled. Decides current or past, and so the address (question 7). |
| `created_by` | account, role actor | nullable | internal | keep |  |

`first_starts_at` and `last_ends_at` are copies, kept in step by every performance write in the same batch, so the lists sort and filter on one indexed table. Indexes: `(state, last_ends_at)`, `(season_id)`, `(category_term_id)`.

**`core_production_slugs`**: realm operational; subject none; no retention; append-only; keyed by the slug, so no id prefix.

Every slug a production has had, so an old link redirects for ever.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `slug` | text | primary key | public | keep | Can never be given to a different production |
| `production_id` | ref `core_productions` | not null, cascade | internal | keep |  |
| `retired_at` | timestamp | not null | internal | keep |  |

**`core_production_credits`**: realm members; subject `{ account: 'account_id', unlinked: 'staff' }`; no retention; not append-only; id prefix `crd`.

Who made the show. Credits feed the public page and the archive.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `production_id` | ref `core_productions` | not null, cascade | internal | keep |  |
| `account_id` | account, role subject, on merge alias | nullable | internal | clear | A credit with no account is a historical or outside credit |
| `credited_name` | text | not null, 1 to 120 characters | public | keep, or anonymise if the person asks | The printed name stays on erasure by default, as a printed programme would (question 5, decided) |
| `role` | text | not null, 1 to 120 characters | public | keep | Such as "Director" or "Ophelia" |
| `section_term_id` | ref `core_terms` | not null, restrict; vocabulary `core.credit-section` | public | keep |  |
| `visibility` | text | not null, default `public`, one of `public`, `members`, `hidden` | internal | keep; set to `hidden` if the name is anonymised | The linked person may change their own |
| `sort` | integer | not null, default 0 | internal | keep |  |

Indexes: `(production_id, section_term_id, sort)`, `(account_id)`.

A credit may have no account: a historical credit, or someone outside the theatre. The format requires a table like this to say how such rows are found for a data request, and the answer is by staff, searching the printed name on the credits screen.

**`core_production_advisories`**: realm operational; subject none; no retention; not append-only; keyed by production and term, so no id prefix.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `production_id` | ref `core_productions` | not null, cascade; primary key part | internal | keep |  |
| `term_id` | ref `core_terms` | not null, restrict; vocabulary `core.advisory`; primary key part | public | keep |  |
| `detail` | text | at most 300 characters | public | keep |  |

**`core_performances`**: realm operational; subject none; no retention; not append-only; id prefix `perf`.

One occasion on which a production happens. Everything record-like in every other module keys to a row here, never to a date or a room.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `production_id` | ref `core_productions` | not null, restrict | internal | keep |  |
| `venue_id` | ref `core_venues` | not null | public | keep |  |
| `space_id` | ref `core_spaces` | not null; `(space_id, venue_id)` references `core_spaces (id, venue_id)`, restrict | public | keep | The venue can never disagree with the space |
| `starts_at` | timestamp | not null | public | keep |  |
| `doors_at` | timestamp | at or before `starts_at` | public | keep | Starts from `core.programme.doors-before` |
| `ends_at` | timestamp | not null, after `starts_at` | public | keep | Always stored, so overlap checks never guess |
| `operating_day` | local date | not null | internal | keep | From `starts_at`, the time zone and the day start (core.locale.time-zone and core.locale.day-start). A show at 00:30 belongs to the night before. |
| `interval_count` | integer | not negative | public | keep | Null takes the production's |
| `capacity` | integer | not negative | internal | keep | Null takes the space's. 0 is a closed house. |
| `label` | text | at most 40 characters | public | keep | Such as "Preview" |
| `external_booking_url` | text | HTTPS only, never empty | public | keep | Null takes the production's |
| `state` | text | not null, default `draft`, one of `draft`, `scheduled`, `cancelled`, `completed` | public | keep | No on-sale state (question 1, decided) |
| `cancelled_at` | timestamp | set exactly when cancelled | public | keep |  |
| `cancel_reason_term_id` | ref `core_terms` | nullable, restrict; vocabulary `core.cancel-reason`; set exactly when cancelled | public | keep |  |
| `cancel_note` | text | at most 200 characters | public | keep | Shown to the public. Staff are told not to name people. |

Indexes: `(starts_at)`, `(operating_day)`, `(production_id, starts_at)`, `(venue_id, starts_at)`, `(space_id, starts_at)`.

**`core_performance_access`**: realm operational; subject none; no retention; not append-only; keyed by performance and term, so no id prefix.

Access features of one performance: captioned, signed, audio described, relaxed.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `performance_id` | ref `core_performances` | not null, cascade; primary key part | internal | keep |  |
| `term_id` | ref `core_terms` | not null, restrict; vocabulary `core.access-feature`; primary key part | public | keep |  |
| `detail` | text | at most 200 characters | public | keep |  |

## Group 2: places

**`core_venues`**: realm operational; subject none; no retention; not append-only; id prefix `ven`.

A building or site. A venue the theatre does not manage (a union room, a hired hall) is the same record with `managed` set to false.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `slug` | text | not null, unique | public | keep |  |
| `name` | text | not null, unique ignoring case | public | keep |  |
| `managed` | boolean | not null, default true | internal | keep | False for a venue the theatre uses but does not run |
| `address_lines` | text | up to four lines | public | keep |  |
| `locality` | text |  | public | keep |  |
| `postcode` | text |  | public | keep |  |
| `country` | text | two-letter ISO code | public | keep |  |
| `latitude`, `longitude` | real | both or neither | public | keep | For the map and for open data |
| `description` | text | markdown | public | keep |  |
| `access_info` | text | markdown | public | keep | The detail a list cannot say: the route, who to ring, what to expect. The features themselves are in `core_place_access`. |
| `getting_here` | text | markdown | public | keep |  |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep |  |

A venue is its own record and never a flagged room. Proscenium reached the same rule in its decision 0043, after starting the other way. Latitude and longitude use the type real, which the foundations format added on 16 November 2026 for measurements. It is never used for money, counts or keys.

**`core_spaces`**: realm operational; subject none; no retention; not append-only; id prefix `spc`.

A room or area inside a venue. Performances happen in a space. The Spaces module will later book them, and Box office will attach seating plans to them.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `venue_id` | ref `core_venues` | not null, restrict; `(id, venue_id)` unique | internal | keep | The pair is what a performance references |
| `slug` | text | not null, unique within the venue | public | keep |  |
| `name` | text | not null, unique within the venue ignoring case | public | keep |  |
| `kind_term_id` | ref `core_terms` | not null, restrict; vocabulary `core.space-kind` | public | keep |  |
| `default_capacity` | integer | greater than 0 | internal | keep | Null is uncapped |
| `performable` | boolean | not null, default true | internal | keep | False keeps it out of the performance picker |
| `exclusive` | boolean | not null, default true | internal | keep | True refuses two overlapping performances |
| `description` | text | markdown | public | keep |  |
| `access_info` | text | markdown | public | keep | The detail a list of features cannot say |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep |  |
| `sort` | integer | not null, default 0 | internal | keep |  |

Creating a venue creates one space with the venue's name in the same batch, so a single-room theatre never has to think about spaces.

**`core_place_access`**: realm operational; subject none; no retention; not append-only; id prefix `pla`.

The access features a venue or a space has, chosen from a set list so each shows as an icon with a label. Added on 16 November 2026 at Matt's suggestion, to match how performances record theirs.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `venue_id` | ref `core_venues` | not null, cascade | internal | keep |  |
| `space_id` | ref `core_spaces` | nullable, cascade; must belong to the venue | internal | keep | Null means the whole venue |
| `term_id` | ref `core_terms` | not null, restrict; vocabulary `core.place-access`; `(venue_id, space_id, term_id)` unique | public | keep |  |
| `note` | text | at most 200 characters | public | keep | Such as "Via the side entrance on Cherry Street" |
| `sort` | integer | not null, default 0 | internal | keep |  |

How the list and the free text work together:

- **The list is the glance, the text is the detail.** The venue page, the `venue-info` component and each date on a production page show a row of icons with labels. `access_info` stays for what a list cannot say: the route, who to ring, what to expect.
- **A space has its venue's features plus its own.** A feature true of the whole building is recorded once, on the venue. One true of a single room (a hearing loop in the studio only) is recorded on that space.
- **An icon never stands alone.** Each is shown with its label, and read out by a screen reader as the label, so the meaning does not depend on recognising a picture.
- **Absence is not a claim.** A venue with no features recorded shows nothing, and never "not accessible". The site-readiness screen lists venues with none recorded, so the gap is seen by the theatre and not by a visitor.
- **Open data.** The features are in the published venue data by their slugs, so others can read them.

**`core_closures`**: realm operational; subject none; no retention; not append-only; id prefix `clo`.

Times when a venue, a space or the whole theatre is shut, and the public holidays brought in from a feed.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `venue_id` | ref `core_venues` | nullable, cascade | internal | keep | Null with a null space means the whole theatre |
| `space_id` | ref `core_spaces` | nullable, cascade; needs `venue_id` | internal | keep |  |
| `kind` | text | not null, one of `closure`, `public_holiday` | internal | keep |  |
| `title` | text | not null, at most 120 characters | public | keep |  |
| `starts_at` | timestamp | not null | public | keep |  |
| `ends_at` | timestamp | not null, after `starts_at` | public | keep |  |
| `all_day` | boolean | not null, default false | public | keep |  |
| `blocks_performances` | boolean | not null | internal | keep | Starts true for a closure, false for a public holiday |
| `source` | text | not null, one of `manual`, `feed` | internal | keep |  |
| `feed_ref` | text | unique where set | internal | keep | Makes a feed import safe to repeat |
| `created_by` | account, role actor | nullable | internal | keep |  |

Indexes: `(starts_at, ends_at)`, `(venue_id, starts_at)`.

## Group 3: vocabularies

A vocabulary is a reusable list of options that a theatre can edit: production categories, advisories, department names, ticket concessions, incident types. Core owns them as a service, by ruling of the integrating thread on 16 November 2026, so the form builder and every module share one mechanism.

**`core_vocabularies`**: realm operational; subject none; no retention; not append-only; keyed by its key, so no id prefix.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `key` | text | primary key | internal | keep | `<module>.<name>` for a module's, `x.<name>` for a theatre's own |
| `owner` | text | not null | internal | keep | A module id, or `theatre` |
| `label` | text | not null | internal | keep |  |
| `description` | text |  | internal | keep |  |
| `ordering` | text | not null, default `manual`, one of `manual`, `alphabetical` | internal | keep |  |
| `locked` | boolean | not null, default false | internal | keep | True means the theatre may relabel and reorder terms but not add or retire them |
| `term_class` | text | not null, default `public`, one of `public`, `internal` | internal | keep | The data class of every term in it |

A module declares its vocabularies and their starting terms in its manifest, and they are created when it is first switched on. A theatre creates its own from the form builder or the vocabulary screen.

**`core_terms`**: realm operational; subject none; no retention; not append-only; id prefix `trm`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `vocabulary_key` | ref `core_vocabularies` | not null, restrict | internal | keep |  |
| `slug` | text | not null, unique within the vocabulary | public | keep | Never changes |
| `label` | text | not null, 1 to 80 characters; unique within the vocabulary among live terms, ignoring case | public | keep |  |
| `description` | text | at most 300 characters | public | keep |  |
| `icon` | text | a name from the bundled icon set | public | keep |  |
| `sort` | integer | not null, default 0 | internal | keep |  |
| `seeded` | boolean | not null, default false | internal | keep | True for a term a module shipped |
| `retired_at` | timestamp |  | internal | keep |  |
| `merged_into_id` | ref `core_terms` | nullable, restrict; same vocabulary | internal | keep |  |

A term's slug, label, description and icon are public-class columns. They cannot take their class from a row, because `core_terms` has no subject, and a term is a word on a list, never a fact about a person. A label must not name a person; the vocabulary editor says so. Where a term is shown is decided by the screen that uses it, not by its class.

A vocabulary and its seeded terms are created when the module that declares it is switched on, or the first time the vocabulary is read, whichever comes first. Both paths are safe to repeat and create nothing twice.

The per row columns take their class from the vocabulary's `term_class`, one hop away through `vocabulary_key`, which the foundations format allows.

The four rules that keep history intact:

- **A record stores a term's id, never its label.** Renaming a term renames it everywhere, past and present. The one exception, ruled by the integrating thread: an immutable submitted record, such as a form answer or an order line, may keep a snapshot of the label beside the id, because it is evidence of what the person saw.
- **A term is never deleted once anything has pointed at it.** Every reference to `core_terms` is `restrict`. A term nothing has ever used can be deleted.
- **Retiring hides a term from pickers and nothing else.** Old records still show its label, marked as retired in staff screens. Retiring can be undone.
- **Merging retires one term into another.** Reads follow `merged_into_id`, so reports group the two together, and the old records are not rewritten.

A term's label should never be a person's name. The form refuses nothing, but the vocabulary screen says so, and a vocabulary of people is a mistake a person picker fixes.

### Vocabularies core ships

| Key | Starting terms | Locked |
| --- | --- | --- |
| `core.production-category` | Play, Musical, Comedy, Dance, Music, Workshop, Social, Other | No |
| `core.credit-section` | Cast, Creative team, Production team, Crew, Band | No |
| `core.advisory` | A starter list of common content warnings and technical warnings (strobe, haze, loud noise) | No |
| `core.access-feature` | Captioned, Sign-language interpreted, Audio described, Relaxed, Touch tour | No |
| `core.space-kind` | Auditorium, Studio, Rehearsal room, Front of house, Workshop, Store, Other | No |
| `core.place-access` | Step-free access, Wheelchair spaces, Lift, Accessible toilet, Changing Places toilet, Hearing loop, Accessible parking, Assistance dogs welcome, Quiet space, Baby changing. Each has an icon. | No |
| `core.cancel-reason` | Illness, Technical problem, Venue unavailable, Weather, Low sales, Other | No |

`core.place-access` describes a building. It is separate from `core.access-feature`, which describes a performance.

## Group 4: files

**`core_files`**: realm operational; subject `{ account: 'uploaded_by', unlinked: 'staff' }`; retention `core.files.deleted-retention`, on deleted rows; not append-only; id prefix `fil`, random.

One more column than the table below shows, added on 16 November 2026 for files the server makes: `expires_at` (timestamp, nullable, `col.internal`, on erasure keep, indexed). Once it passes, the row and the bytes both go, without the deleted-retention wait. Only a file in a server-made slot may carry it; part 4 gives the rules. Such a file has no uploader, so `uploaded_by` is null and it is erased with the record that owns it.

One row for every stored file in the system, whichever module it belongs to. The bytes live in R2 and the row is the only way to reach them. The id is random because it appears in the file's address and must not be guessable.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `object_key` | text | not null, unique | internal | keep | An opaque R2 key, never built from the file name |
| `owner_type` | text | not null | internal | keep | A registered record type such as `core.production` |
| `owner_id` | text | not null | internal | keep | No reference, because the owner may be any module's record |
| `slot` | text | not null | internal | keep | A slot the owning module declared, such as `poster` |
| `sort` | integer | not null, default 0 | internal | keep |  |
| `original_name` | text | at most 255 characters | personal | clear | Shown only to staff. A file name can carry a person's name. |
| `text_class` | text | not null, one of `public`, `internal`, `personal` | internal | keep | Copied from the slot when the file is attached |
| `title` | text | at most 120 characters | per row | keep | Class from `text_class`. Goes with the file when its owner is erased. |
| `alt_text` | text | at most 300 characters | per row | keep | Class from `text_class`. Required before a public image is published. |
| `media_type` | text | not null | internal | keep | Found by reading the bytes, never taken from the browser |
| `byte_size` | integer | not null, greater than 0 | internal | keep |  |
| `sha256` | text | not null | internal | keep |  |
| `width`, `height` | integer |  | internal | keep | Set for images |
| `access` | text | not null, one of `public`, `signed_in`, `record` | internal | keep |  |
| `state` | text | not null, default `pending`, one of `pending`, `ready`, `rejected`, `deleted` | internal | keep | See part 3 |
| `rejected_reason` | text | a code | internal | keep | Never free text |
| `uploaded_by` | account, role subject, on merge alias | nullable | internal | clear | Subject only for `original_name` |
| `ready_at`, `deleted_at` | timestamp |  | internal | keep |  |
| `purge_after` | timestamp | set with `deleted_at` | internal | keep |  |

Indexes: `(owner_type, owner_id, slot, sort)`, `(state, purge_after)`.

**Slots.** A module declares in its manifest which files its records can hold: the slot's name, whether it takes one file or many, the accepted types, the size limit (a setting), the default `access`, the class of its title and alt text, and whether the file is cleaned. Core's own slots are listed in part 4.

**Access.** `public` files are served to anyone and cached. `signed_in` needs any account. `record` asks the owning module whether this person may read this record, so a module's private documents never depend on core guessing.

**No table of image sizes.** Images are resized on request by Cloudflare Images from a fixed list of named sizes (part 4), so nothing is stored but the cleaned original.

**When a record holding a person's files is erased**, the owning module's erasure handler calls the file service, which deletes the rows and the stored bytes in the same pass.

## Group 5: notifications

A **notification** is one thing the system has to tell one recipient. A **delivery** is one attempt to tell them by one channel. Keeping the two apart is what lets one event reach the inbox and the email without either blocking the other.

Notification types are not a table. A module declares each type in its manifest (part 4), so the list is the same in every theatre on the same release.

The tables about a person carry a `side` column, `audience` or `members`, and declare it as their realm, which the foundations format allows. The side comes from the declared type or topic and never changes on a row.

**`core_notifications`**: realm from `side`; subject `{ account: 'account_id', email: 'address' }`; retention `core.notifications.log-retention`; not append-only; id prefix `ntf`.

A row has an account or, for a send before any account exists, an address. The `address` column is an email column, so a data request by email address finds those rows.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `type_key` | text | not null | internal | keep | A declared type such as `box-office.order.confirmed` |
| `side` | text | not null, one of `audience`, `members` | internal | keep | From the type |
| `account_id` | account, role subject, on merge alias | nullable | internal | clear |  |
| `address` | text | exactly one of `account_id`, `address` at creation | personal | clear | Only for a send to an address with no account. Cleared anyway once every delivery is finished. |
| `locale` | text | not null | internal | keep |  |
| `subject_type`, `subject_id` | text |  | internal | keep | The record this is about. No reference. |
| `dedupe_key` | text | unique where set | internal | keep |  |
| `coalesce_key` | text |  | internal | keep |  |
| `payload` | JSON | checked against the type's declared variables | personal | clear | Cleared anyway once every delivery is finished |
| `actor_id` | account, role actor | nullable | internal | keep |  |

One more column, added on 16 November 2026: `sealed_variables` (text, nullable, `col.internal` with `encrypted: true`, on erasure cleared). It holds the values of variables the type declares as sealed, such as a sign-in link, and is set to null when the email delivery reaches a final state. Part 4, "A variable that carries a secret", gives the rules.

`dedupe_key` is how a caller makes a send safe to repeat: a second insert with the same key does nothing. The row outlives its payload, so the log can say that a receipt was sent without holding what it said.

**`core_notification_deliveries`**: realm from `side`; subject through `notification_id`; retention with its notification; not append-only; id prefix `ndl`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `notification_id` | ref `core_notifications` | not null, cascade; `(notification_id, channel)` unique | internal | keep |  |
| `side` | text | not null, one of `audience`, `members` | internal | keep | Copied from the notification |
| `channel` | text | not null | internal | keep | A registered channel: `email`, `inbox`, later `push` |
| `state` | text | not null, one of `queued`, `held`, `sending`, `sent`, `retrying`, `failed`, `suppressed`, `skipped`, `bounced` | internal | keep | See part 3 |
| `reason` | text | a code | internal | keep | Such as `preference`, `no_address`, `suppressed_address`, `module_off` |
| `template_id` | ref `core_notification_templates` | nullable, restrict | internal | keep | Null means the shipped wording |
| `sender_key` | ref `core_sender_identities` | nullable, restrict | internal | keep |  |
| `provider_ref` | text |  | internal | keep | The provider's message id |
| `attempts` | integer | not null, default 0 | internal | keep |  |
| `next_attempt_at` | timestamp |  | internal | keep |  |
| `last_error` | text | a code | internal | keep | Never the provider's message |
| `rolled_into_id` | ref `core_notifications` | nullable, set null | internal | keep | The digest that carried it |
| `sent_at` | timestamp |  | internal | keep |  |

Index: `(state, next_attempt_at)`.

The state list also holds `complained`, for a recipient's spam complaint, and `core_notifications` has an index on `(subject_type, subject_id)`. Both were added on 16 November 2026 for the Communications module (part 4), so that no migration is needed when it arrives.

**`core_inbox_items`**: realm from `side`; subject `account_id`; retention `core.notifications.inbox-retention`; not append-only; on erasure the row is deleted; id prefix `inb`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | account, role subject, on merge alias | not null | internal | clear |  |
| `delivery_id` | ref `core_notification_deliveries` | nullable, set null | internal | keep |  |
| `side` | text | not null, one of `audience`, `members` | internal | keep |  |
| `title` | text | not null, at most 120 characters | personal | clear |  |
| `body` | text | at most 500 characters | personal | clear |  |
| `link` | text |  | internal | keep | A path inside the application, never a full address |
| `read_at`, `archived_at` | timestamp |  | internal | keep |  |
| `expires_at` | timestamp | not null | internal | keep |  |

Index: `(account_id, side, archived_at, created_at)`. The unread count is a count over this index where `read_at` is null.

**`core_notification_preferences`**: realm from `side`; subject `account_id`; no retention; not append-only; on erasure the row is deleted; keyed by account, topic and channel, so no id prefix.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `account_id` | account, role subject, on merge handler | not null; primary key part | internal | clear | On a merge the survivor's row wins where both have one |
| `topic_key` | text | not null; primary key part | internal | keep | A declared topic |
| `channel` | text | not null; primary key part | internal | keep |  |
| `side` | text | not null, one of `audience`, `members` | internal | keep | From the topic |
| `enabled` | boolean | not null | personal | clear |  |
| `digest` | text | not null, default `immediate`, one of `immediate`, `daily`, `weekly` | personal | clear |  |

No row means the type's default. A type in the transactional category has no topic, so no row can ever mute it.

**`core_notification_template_drafts`**: realm operational; subject none; no retention; not append-only; id prefix `ntd`.

A theatre's own wording for a type while it is being written. The shipped wording lives in the code and is not a row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `type_key` | text | not null; `(type_key, channel, locale)` unique | internal | keep | One draft for each type, channel and locale |
| `channel` | text | not null | internal | keep |  |
| `locale` | text | not null | internal | keep |  |
| `subject` | text | required for `email` | internal | keep |  |
| `body` | text | not null; markdown with the type's declared variables only | internal | keep |  |
| `updated_by` | account, role actor | nullable | internal | keep |  |

**`core_notification_templates`**: realm operational; subject none; no retention; append-only; id prefix `ntt`.

The published versions. Publishing copies the draft into a new row here in one batch. The foundations thread ruled that a table is append-only as a whole or not at all, which is why drafts are a separate table.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `type_key` | text | not null | internal | keep |  |
| `channel` | text | not null | internal | keep |  |
| `locale` | text | not null | internal | keep |  |
| `version` | integer | not null, greater than 0; `(type_key, channel, locale, version)` unique | internal | keep |  |
| `use_shipped` | boolean | not null, default false | internal | keep | True is a version that goes back to the shipped wording |
| `subject` | text | required for `email` unless `use_shipped` | internal | keep |  |
| `body` | text | markdown; required unless `use_shipped` | internal | keep |  |
| `published_by` | account, role actor | nullable | internal | keep |  |

The newest version for a type, channel and locale is the one in use, and every older one is retired. That state is worked out and not stored, so no row ever changes and the log can always show the wording that was sent.

**`core_sender_identities`**: realm operational; subject none; no retention; not append-only; keyed by its key, so no id prefix.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `key` | text | primary key | internal | keep | `default` always exists |
| `display_name` | text | not null, at most 60 characters | public | keep |  |
| `local_part` | text | not null, unique | public | keep | The part before the @ on the theatre's sending domain |
| `reply_to` | text |  | internal | keep | A role address, not a person's own |
| `state` | text | not null, default `active`, one of `active`, `retired` | internal | keep |  |

**`core_notification_routing`**: realm operational; subject none; no retention; not append-only; keyed by the topic, so no id prefix.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `topic_key` | text | primary key | internal | keep | A declared topic, or `transactional` |
| `sender_key` | ref `core_sender_identities` | not null, restrict | internal | keep |  |

No row means the `default` sender.

**`core_email_suppressions`**: realm operational; subject none; no retention; not append-only; keyed by the address hash, so no id prefix.

Addresses the system must not email, whoever asks. The Communications module reads this list and does not keep its own.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `address_hash` | text | primary key | internal | keep | A keyed hash of the lower-cased address. It cannot be traced back to an account without the key, and it is what stops mail to an erased person. |
| `reason` | text | not null, one of `hard_bounce`, `complaint`, `manual` | internal | keep |  |
| `lifted_at` | timestamp |  | internal | keep |  |
| `lifted_by` | account, role actor | nullable | internal | keep |  |

**`core_push_subscriptions`** (later release): realm from `side`; subject `account_id`; no retention; not append-only; on erasure the row is deleted; id prefix `psh`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | account, role subject, on merge alias | not null | internal | clear |  |
| `side` | text | not null, one of `audience`, `members` | internal | keep |  |
| `endpoint` | text | not null, unique | personal | clear |  |
| `keys` | text, encrypted | not null | personal | clear |  |
| `device_label` | text |  | personal | clear |  |
| `last_used_at` | timestamp |  | internal | keep |  |

## Group 6: webhooks

Added on 16 November 2026 by Matt's decision on question 9, which has the rules. Two tables, with id prefixes `whk` and `whd`.

**`core_webhooks`**: realm operational; subject none; no retention; not append-only; id prefix `whk`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, 1 to 60 characters, unique ignoring case | internal | keep |  |
| `format` | text | not null, one of `json`, `discord`, `slack` | internal | keep |  |
| `url` | text, encrypted | not null; HTTPS only; no private or local address | internal | keep | Shown masked after saving |
| `secret` | text, encrypted | not null for `json`; generated, shown once | internal | keep | Signs each delivery. Can be rotated. |
| `events` | JSON | not null; a list of event names, each a declared event or `<module>.*` | internal | keep | An unknown name is refused at save |
| `state` | text | not null, default `active`, one of `active`, `paused`, `failing` | internal | keep | `failing` is a pause the system made |
| `consecutive_failures` | integer | not null, default 0 | internal | keep |  |
| `last_success_at` | timestamp | nullable | internal | keep |  |
| `created_by` | account, role actor | nullable | internal | keep |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

**`core_webhook_deliveries`**: realm operational; subject none; retention `core.webhooks.log-retention`; not append-only; id prefix `whd`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep | Sent as the delivery's id, so a receiver can ignore a repeat |
| `webhook_id` | ref `core_webhooks` | not null, cascade | internal | keep |  |
| `event_id` | text | not null; `(webhook_id, event_id)` unique | internal | keep | One delivery for each event and webhook |
| `event_name` | text | not null | internal | keep |  |
| `state` | text | not null, one of `queued`, `sending`, `sent`, `retrying`, `failed` | internal | keep | Same moves as a notification delivery in part 3 |
| `attempts` | integer | not null, default 0 | internal | keep |  |
| `next_attempt_at` | timestamp | nullable | internal | keep |  |
| `response_status` | integer | nullable | internal | keep | The receiver's HTTP status |
| `last_error` | text | nullable; a code | internal | keep | Never the receiver's response body |
| `created_at`, `sent_at` | timestamp | `created_at` not null | internal | keep |  |

Index: `(state, next_attempt_at)`. The body sent is not stored: it is rebuilt from the event, which keeps personal data out of this table by construction.

What goes with the tables:

| Kind | Name | Detail |
| --- | --- | --- |
| Ability | `core.webhook.manage` | Site-wide, privileged. Create, edit, pause, rotate the secret, send a test, read the delivery log. |
| Setting | `core.webhooks.max-attempts` | integer, default 8, 1 to 15 |
| Setting | `core.webhooks.pause-after` | integer, default 20 consecutive failures, 5 to 100 |
| Setting | `core.webhooks.log-retention` | duration, default 30d, 1d to 365d |
| Setting | `core.webhooks.timeout` | duration, default 10s, 1s to 30s |
| Job | `core.send-webhook` | Sends one delivery |
| Notification type | `core.webhook.paused` | Transactional, members' side, to holders of `core.webhook.manage` |
| Event | `core.webhook.paused` | Announced when the system pauses one. Never itself sent to webhooks, to avoid a loop. |
| Screen | Console, Webhooks | List with state and last success. Editor with event picker and "send a test". Delivery log with retry. |

How a delivery is made. A listener cannot write into the batch that announces an event, so core's webhook listener runs afterwards, in its own unit on the prompt lane. It is declared with `on: 'deliverable'`, which means every event not marked internal, and which only core may use. For each active webhook subscribed to the event it adds one `queued` delivery; the unique pair of webhook and event makes a repeat harmless. The job sends it. The five-minute sweep re-queues anything stuck.

The url and the secret are `col.internal` with `encrypted: true`, the option the foundations format added on 16 November 2026: the value is encrypted with the core key, carries its key version and never reaches a browser. The console shows a masked hint. `core_push_subscriptions.keys` is `col.personal` with the same option.

The foundations format now supports this (its rules E6 and E7). Every announced event can go to a webhook unless its module declares `internal: true` on it, and a check makes every event about a record with a person as its subject say which it is. The webhook screen offers only events not marked internal, read from the registry. Core's system events, such as `core.setting.changed`, are internal. `core.send-webhook` runs in the bulk lane and calls out through the kit's fetch wrapper, which is where the check on outside addresses lives.

## What needs no table

| Subject | Where it lives instead |
| --- | --- |
| Branding | Settings under `core.brand.*` (part 6) and files owned by the record type `core.branding`. A revision number in settings changes on every save, so cached pages and stylesheets know to refresh. |
| Organisation details | Settings under `core.organisation.*`: name, time zone, language, currency, the hour the operating day rolls over. |
| The public site | Content files in the fork's `site/` folder, and settings under `public-site.*`. The `public-site` module owns no tables in the first release. |
| Notification types, topics, file slots, image sizes | Module manifests. |

## Tables that only grow

`core_production_slugs` and `core_notification_templates` are append-only, enforced by triggers as the paper requires. Nothing else in core is a ledger: programme records are edited in place, and every change of state writes an audit entry in the same batch.

## When a person is erased

Core holds little about people, by design. In the one batch that the identity module's erasure runs:

| Data | What happens |
| --- | --- |
| Credits naming the person | The link to the account is cleared. The printed name stays, as it would on a printed programme, unless the person asks for it to go, when it is anonymised and the credit hidden (question 5, decided). |
| Files they uploaded | `uploaded_by` and `original_name` are cleared. The file stays with its record. |
| Their inbox, preferences and push subscriptions | The rows are deleted. |
| Notifications sent to them | `account_id` is cleared, with any payload or address still held. The log keeps the type, time and outcome. |
| A suppression of their address | Kept, as a keyed hash, so the system can never write to them again by accident. |
| Columns that record who did something (`created_by`, `actor_id`, `lifted_by`, `updated_by`, `published_by`) | Kept. They point at the account row, which workstream 2 anonymises, so nothing personal remains. |

## When two accounts are merged

A merge is staged and can be repeated, and a column follows it by alias unless it has a stated reason not to (integration ruling R-34, 16 November 2026). An aliased row keeps the id it was written with, and every read, count or claim by account goes through the kit's account scope: the survivor and its aliases. A column is moved only where the stored id must be the survivor's.

| Column | On merge | Why |
| --- | --- | --- |
| `core_production_credits.account_id` | alias | No unique rule names the account, and nothing keys to a credit by account. My credits and the public credit list read through the account scope. |
| `core_files.uploaded_by` | alias | It records who uploaded. Nothing is unique by it. |
| `core_notifications.account_id` | alias | A log of what was sent. The dedupe check for a new send reads through the account scope, so a message already sent to the losing account is not sent again to the survivor. The dedupe key is a hash that includes the account id, so the check computes it once for each account in the scope and skips the send if any exists. The unique index remains the guard against a race on one account. |
| `core_inbox_items.account_id` | alias | The inbox list and the unread count read through the account scope. |
| `core_push_subscriptions.account_id` (later release) | alias | A push to a person goes to every subscription in the account scope. The endpoint, not the account, is what is unique. |
| `core_notification_preferences.account_id` | handler | The row is keyed by account, topic and channel, so both accounts may hold one for the same pair, and only one may stand. The handler keeps the survivor's and deletes the other. Until that stage has run, a read takes the survivor's row where both exist. |
| Every column of role actor | alias | It records who did something. |

No core-domain column is moved. Proscenium's known issues record what a merge must not do: preferences, the log and the inbox were left behind on the losing account. Here they are reached through the scope instead.

## What the foundations thread ruled

This specification asked three things of the data-class format. The rulings of 16 November 2026 are built into the tables above.

- **A realm that follows the row: granted.** The notification tables about a person declare `realm: { column: 'side' }`.
- **Append-only for some rows: refused.** Templates are therefore two tables, drafts and published versions.
- **A class taken from a parent row: granted, one hop.** A term's label takes its class from its vocabulary. A file's title and alt text take theirs from `text_class` on the same row, copied from the slot at attach time, since the owner may be any module's record.

Nuxt Content keeps its own tables in the same database, named `_content_*`. The migration journal ignores them and no module may use that prefix.

## All 26 tables and their id prefixes

The foundations format gives every generated id the shape `<prefix>_<26 characters>`, so an id says what kind of record it is. Each table with an `id` column declares its prefix. Ids sort by creation time unless marked random. Public addresses use slugs, never ids.

| Table | Group | Id prefix | Notes |
| --- | --- | --- | --- |
| `core_seasons` | Programme | `sea` |  |
| `core_productions` | Programme | `prd` |  |
| `core_production_slugs` | Programme | none | Keyed by the slug. Append-only. |
| `core_production_credits` | Programme | `crd` |  |
| `core_production_advisories` | Programme | none | Keyed by production and term |
| `core_performances` | Programme | `perf` |  |
| `core_performance_access` | Programme | none | Keyed by performance and term |
| `core_venues` | Places | `ven` |  |
| `core_spaces` | Places | `spc` |  |
| `core_place_access` | Places | `pla` |  |
| `core_closures` | Places | `clo` |  |
| `core_vocabularies` | Vocabularies | none | Keyed by its key |
| `core_terms` | Vocabularies | `trm` |  |
| `core_files` | Files | `fil` | Random: the id appears in the file's address |
| `core_notifications` | Notifications | `ntf` |  |
| `core_notification_deliveries` | Notifications | `ndl` |  |
| `core_inbox_items` | Notifications | `inb` |  |
| `core_notification_preferences` | Notifications | none | Keyed by account, topic and channel |
| `core_notification_template_drafts` | Notifications | `ntd` |  |
| `core_notification_templates` | Notifications | `ntt` | Append-only |
| `core_sender_identities` | Notifications | none | Keyed by its key |
| `core_notification_routing` | Notifications | none | Keyed by the topic |
| `core_email_suppressions` | Notifications | none | Keyed by the address hash |
| `core_push_subscriptions` | Notifications | `psh` | Later release |
| `core_webhooks` | Webhooks | `whk` |  |
| `core_webhook_deliveries` | Webhooks | `whd` |  |

Eighteen tables have a prefix and eight have a natural key. Three prefixes registered earlier (`psl`, `adv`, `pfa`) are withdrawn, because the tables they were for are keyed by a slug or a pair and generate no id.
