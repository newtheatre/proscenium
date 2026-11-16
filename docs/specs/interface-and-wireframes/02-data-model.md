# 2. Data model

The interface layer owns three small tables in the database and three stores on the device. It holds almost no data of its own by design: what a screen shows belongs to the module that owns the screen.

Tables are prefixed `core_` because the interface layer is part of the core. Each is described with the heading line every workstream uses (realm, subject, append-only, retention), and each column carries one of the five data classes of workstream 1's data-class registry (public, internal, personal, personal free text, special category).

| Table | Purpose | Realm | Subject | Append-only | Retention | Id prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `core_preferences` | A person's own interface choices | system | the account (`account_id` is a `col.account` with role subject) | no | until the account is erased | none: keyed by (`account_id`, `key`) |
| `core_saved_views` | Named filters for a list | system | none while shared; the owner (`owner_account_id` is a `col.account` with role subject) while personal | no | until deleted | `svw` |
| `core_navigation_overrides` | A theatre's changes to the declared menus | system | none | no | for ever | none: keyed by the navigation entry's id |

Only `core_saved_views` has an id of its own, made by `col.id()` with the prefix `svw`; foundations lists it in its index of prefixes.

## In the database

### `core_preferences`

One row per person per preference. Nothing here changes what a person may do. `account_id` is declared with `col.account`, role subject, `onMerge: 'handler'`: the interface contributes a handler to identity's `core.merge-handler`, by which the surviving account keeps its own row for a key and takes the other account's row only where it has none.

| Column | Type | Constraints | Data class | On erasure |
| --- | --- | --- | --- | --- |
| `account_id` | text | Primary key with `key`; references the account | Personal | Row deleted |
| `key` | text | Primary key with `account_id`; one of a fixed list checked in code | Internal | Row deleted |
| `value` | text (JSON) | Validated against the key's schema | Internal | Row deleted |
| `updated_at` | integer (UTC) | Not null | Internal | Row deleted |

Keys in the first release: `appearance` (system, light, dark), `landing` (where sign-in lands), `members-nav` (a member's own order of bottom-bar sections), `dismissed` (hints and the welcome already seen). Language is not a key: a person's language is identity's column `core_accounts.locale`. Dark live screens are the theatre's setting `core.appearance.live-dark`, not a personal key.

Sidebar width, collapsed groups, the last-used tab and whether the result sound is muted stay in the browser's local storage: they are about a device, not a person.

### `core_saved_views`

A named filter, sort and column set for one list.

| Column | Type | Constraints | Data class | On erasure |
| --- | --- | --- | --- | --- |
| `id` | text | Primary key, `col.id()` with prefix `svw` | Internal | Kept if shared, else row deleted |
| `list` | text | Not null; a list's registered name, such as `box-office.orders` | Internal | As the row |
| `name` | text | Not null, 1 to 60 characters | Personal free text | Deleted with a personal view; kept on a shared view |
| `owner_account_id` | text | `col.account`, role subject, `onMerge: 'move'` (a merged account's views pass to the surviving account); null once anonymised | Personal | Set to null on a shared view |
| `shared` | integer (boolean) | Not null, default 0 | Internal | As the row |
| `query` | text (JSON) | Filters, sort, columns; validated against the list's own filter schema on read | Internal | As the row |
| `created_at`, `updated_at` | integer (UTC) | Not null | Internal | As the row |

- Unique on (`list`, `owner_account_id`, `name`) for personal views and on (`list`, `name`) for shared ones.
- A saved view never stores results, only the question. A view whose filters no longer validate (a filter was removed in an update) opens with the invalid part dropped and says so.
- A filter value may be a person's id ("orders for this customer"). A view holds ids only, so erasure of that person leaves a filter that matches nothing.

### `core_navigation_overrides`

A theatre's changes to the menus the modules declared.

| Column | Type | Constraints | Data class | On erasure |
| --- | --- | --- | --- | --- |
| `entry_id` | text | Primary key; a navigation entry's id | Internal | Kept |
| `hidden` | integer (boolean) | Not null, default 0 | Internal | Kept |
| `order` | integer | Null means the declared order | Internal | Kept |
| `label` | text | Null means the declared label; up to 30 characters | Public | Kept |
| `updated_at` | integer (UTC) | Not null | Internal | Kept |

An override can hide, reorder and rename. It has no column that could widen who sees an entry. A row whose entry no longer exists is ignored and listed on the navigation settings screen for clearing.

## On the device

These live in the browser's own storage (IndexedDB), never in D1. They hold copies, so they are cleared on sign-out and expire on their own.

| Store | Holds | Kept for | Data class of contents | Cleared when |
| --- | --- | --- | --- | --- |
| Live data | Named data sets a live screen loaded: tonight's ticket list, tonight's rota. What a set contains is its module's decision: box office's door list carries ticket codes and states, and buyers' names only when its own setting allows (off by default) | The show night, 18 hours at most (a setting) | Personal at most; no payment details, no special-category data | Sign-out, expiry, or the server says the set is void |
| Write queue | Actions taken while offline, each with route, body, idempotency key, time and state | Until confirmed or dismissed, and never retried once it is 48 hours old | Whatever the action carries | Sign-out, after a warning if anything is unsent |
| Form drafts | The unsaved contents of long forms | 7 days | Whatever the form carries; forms with special-category fields are never drafted | Save, discard, sign-out, expiry |

### Write queue entry

| Field | Meaning |
| --- | --- |
| `id` | The idempotency key, made on the device |
| `route`, `body` | What to send |
| `label` | Words for the sync status screen ("Admitted ticket 4F7K2") |
| `created_at` | When the person did it, which the server records as the time of the act |
| `attempts`, `last_error` | For retry and for showing why something is stuck |
| `state` | Queued, sending, confirmed, refused or stuck; see tab 3 |

An entry is never sent once it is older than foundations' idempotency window (48 hours, `core_idempotency_keys`). Past that age the server no longer remembers the key, so a retry of an act that did commit would run twice. Such an entry moves to stuck for good: the device stops retrying, shows it on the sync status screen and asks the person to check the record and then dismiss it or do it again by hand. The 48 hours is read from foundations and is not a second setting.

## What is deliberately not stored

- **No interface audit.** Changing a preference is not audited. Changing a navigation override is, through the settings audit.
- **No tracking of what people look at.** There is no page-view table and no analytics store.
- **No recent-items list on the server.** The command palette's recents stay on the device.
- **No copy of abilities.** The viewer's abilities are computed per request by workstream 2 and never cached in an interface table.
