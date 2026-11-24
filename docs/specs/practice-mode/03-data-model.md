# 2. Data model

Practice mode adds no table to the real database. A practice store holds every module's tables, made from the same migration bundle as the real database, plus four tables of its own. What the configuration copy brings is decided by a new `practice` option on each table, and every personal column passes through its own erasure rule on the way.

Tables below are in Foundations' layout: a line of options, then one row per column. `created_at` and `updated_at` are left out. An instant is UTC milliseconds.

## The practice store

- **One per person.** A Durable Object class `PracticeStore` (binding `PRACTICE`, SQLite-backed), addressed by name `practice:<account id>` with the survivor's id. Finding a person's store needs no table, so starting practice writes nothing real.
- **The D1 shape the kit uses.** It answers `prepare`, `bind`, `first`, `all`, `run`, `raw` and `batch`. A batch runs as one SQLite transaction, so a unit of work commits whole or not at all exactly as on D1 (Foundations U1 to U9).
- **The same schema.** Session start applies the migration bundle, life-cycle and counter triggers included, so append-only tables refuse updates in practice too.
- **Short-lived.** The store's alarm deletes all its storage when the session ends. Nothing in it is backed up, and D1's Time Travel never sees it.
- **Not a second D1 database.** The invariant "one Worker, one D1 database" (Foundations, part 3) holds; the store is scratch space, like the rate-limit counters.

### The other bindings in practice

| Binding | Real | In practice |
| --- | --- | --- |
| `DB` | The D1 database | The person's practice store |
| `FILES` | R2 bucket | Reads fall through to the real bucket only for files whose `core_files` row the copy brought (logos, public images). Writes go under `practice/<account id>/` and are deleted with the store |
| `CACHE` | KV | Keys prefixed `practice:<account id>:`, expiring when the session can end at the latest |
| `JOBS_PROMPT`, `JOBS_BULK` | Queues | Replaced by a runner in the store: a job a practice unit commits runs after the response, inside the store, under the practice context |
| `EMAIL`, `EMAIL_EVENTS` | Email Sending and its reports | Absent. Core's mailer writes each would-be email to the outbox |
| `REALTIME` | Realtime rooms | The same class; rooms are named `practice:<account id>:<room>`, so only that session's screens hear each other |
| `RATE_LIMITS` | Shared counters | Unchanged. Practice counts towards the person's real limits, which is what stops a script hammering a store |
| Credentials | `credential()` from the app's secrets | Answer unset. No provider key, token or webhook secret reaches practice code |

## Practice's own tables

Declared by core with the table option `store: 'practice'`, so they exist only inside a practice store and are never migrated into D1. Ids are registered with Foundations' index: `pss`, `pob`, `pca`, all time-sorted and none secret.

**`core_practice_session`**: id prefix `pss`; realm system; subject `account_id`; exactly one row per store; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | account | not null | internal | store deleted | The person practising. Their real id, so audit rows inside the store read naturally |
| `scenario_id` | text | not null, a contributed scenario id | internal | store deleted | `box-office.door-scan` |
| `scenario_version` | integer | not null, at least 1 | internal | store deleted | The scenario's version when the store was made. A newer version offers "Start again" and never migrates the store |
| `bundle_hash` | text | not null | internal | store deleted | The migration bundle the store was made from. A deploy with a different bundle ends the session at its next request (rule S7) |
| `started_at` | timestamp | not null | internal | store deleted |  |
| `last_active_at` | timestamp | not null | internal | store deleted | Moved by every marked request, at most once a minute |
| `ends_at` | timestamp | not null | internal | store deleted | The earlier of `last_active_at` plus `core.practice.idle-end` and the end of the show night (04:00, rule S5) |

**`core_practice_outbox`**: id prefix `pob`; realm system; subject none (sample people only); not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | store deleted |  |
| `type_key` | text | not null | internal | store deleted | The notification type, such as `box-office.order-confirmed` |
| `channel` | text | not null, one of `email`, `inbox`, `push` | internal | store deleted |  |
| `to_label` | text | not null, at most 200 characters | internal | store deleted | The sample person's name and address. Always fictional |
| `subject` | text | at most 300 characters | internal | store deleted |  |
| `body_html`, `body_text` | text | rendered exactly as core would send them | internal | store deleted | The theatre's own wording, from the copied templates |
| `at` | timestamp | not null | internal | store deleted |  |

**`core_practice_calls`**: id prefix `pca`; realm system; subject none; append-only inside the store.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | store deleted |  |
| `call` | text | not null, a declared external call | internal | store deleted | `payments.start-payment` |
| `reference` | text | not null | internal | store deleted | The record the call was for |
| `answer` | text | not null, one of `succeeded`, `failed`, `unknown`, `waiting` | internal | store deleted | `waiting` while the practice card reader waits for the trainee's choice |
| `chosen_by` | text | one of `scenario`, `trainee`, `default` | internal | store deleted | Who decided the answer |
| `at` | timestamp | not null | internal | store deleted |  |

**`core_practice_task_results`**: keyed by `task_id`; realm system; subject none; not append-only. Columns `task_id` (text, primary key) and `passed_at` (timestamp, not null). A task passes once and stays passed for the session.

## The copy declaration

Every table gains the option `practice`, one of `empty` (the default), `copy`, or `replace`. The build refuses `copy` on a table of realm `audience` or `members`, on an append-only ledger, audit or event table, and on a table with a `special` column that is not null.

| Option | At session start |
| --- | --- |
| `empty` | The table is made and left empty for sample sets to fill |
| `copy` | Every row is copied from the real database, column by column as below |
| `replace` | The table's module writes its own stand-in rows instead (Payments uses this for provider accounts, part 4) |

| Column class | In the copy |
| --- | --- |
| `public`, `internal` | Copied as is |
| `personal`, `freeText` | Passed through the column's own erasure behaviour: `anonymise` writes its placeholder, `clear` writes null, `redact` writes the marker, `keep` copies |
| `special`, and any column declared `encrypted` | Never copied: null |
| `col.account` columns | Re-pointed to the store's sample staff account, "Practice staff" |
| Settings marked `sensitive` or `managed` | Not copied; the default applies |

The copy reads by declaration, through the kit, the way erasure and export already do, so no module reads another module's tables. It is one read per copied table, in pages of `core.units.set-rows-limit` rows, and one transaction into the store.

### Tables proposed for copy in the first release

Each owning module confirms by setting the option; a table not listed stays `empty`.

| Module | Copied | Notably not copied |
| --- | --- | --- |
| Core | `core_modules`, `core_settings`, `core_vocabularies`, `core_terms`, `core_venues`, `core_spaces`, `core_place_access`, `core_notification_templates`, `core_files` rows in public slots | Accounts and everything of Identity's, signing keys (the store makes its own), credentials, audit, events, jobs, notifications, webhooks |
| Box office | `bands`, `ticket_types`, `pass_types`, `seating_plans`, `plan_seats` | Performances' sales and prices (sample sets make them from the copied ticket types), orders, tickets, promo codes |
| Payments | none | `provider_accounts` is `replace`: one practice card reader account, and a cash account only if the theatre has one in use |
| Finance | `accounts`, `tax_codes` | Postings, entries, seals, periods |
| Front of house | `duties`, `rota_templates`, `checklists`, `checklist_items`, `emergency_cards` | Shifts, assignments, incidents, night reports |
| Bar | `outlets`, `categories`, `products`, `variants`, `price_lists`, `prices`, `recipe_lines`, `stock_items`, `stock_locations` | Stock levels and movements (sample set), sales, age checks |
| Membership | `schemes`, `length_options` | Memberships, members, verification lists |

## Sample records

Sample sets write fictional records through each module's own services, inside the store (part 4). Three rules keep them obviously unreal:

- **Names** come from one list in core's catalogue ("Ash Example", "Sam Sample"), never generated from real names.
- **Email addresses** end `@practice.invalid`. The `.invalid` top-level domain is reserved and can never be delivered to ([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)), so even a send that escaped would go nowhere.
- **Phone numbers** come from Ofcom's range kept for drama, believed to be 07700 900000 to 07700 900999 (to confirm on Ofcom's site when built: it refused an automated check on 23 November 2026).

## Erasure, merges and export

| Event | What happens to practice data |
| --- | --- |
| The person's account is erased | Identity's erasure ends their session and deletes the store before it reports done (rule S9) |
| The account is merged away | The merge job ends the merged-away account's session; the survivor's own store is untouched |
| Subject access export | Practice stores are not exported. They hold nothing about the person beyond their display name, and they are deleted within one show night |
| Retention | At most until 04:00 after the session started, by rule S5 |
