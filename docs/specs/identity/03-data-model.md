# 2. Data model

Identity owns twenty tables, all inside the `core` module. One row in `core_accounts` is one person; everything else hangs off it. No table stores "is a member", "is staff" or "is pending": those are read from facts at the moment they are asked.

## Reading the tables

- **Types.** `id` is the platform's opaque identifier and `enum` is text limited by a check constraint. Where a table below says `time` or `instant` it is the foundations type `timestamp` (a UTC instant), and `flag` is `boolean`.
- **Prefix.** Tables are named `core_<plural>`, the foundations format, because identity is an area of the always-on `core` module.
- **Class** is the paper's data class: Public, Internal, Personal, Personal free text, Special category.
- **On erasure** says what the erasure batch does to the column on the erased person's own rows. In the foundations verbs, "Set to null" is `clear`, "Kept" is `keep`, and "Row deleted" is the table option `onErasure: 'delete-row'`. A column the batch overwrites with a placeholder is `anonymise`.
- **On merge** is given per table: what happens to the merged-away account's rows. The account that is kept is the survivor.
- **A reference to an account** in any other module's table declares the same two behaviours in its data-class entry. Identity never names another module's table.

## Heading line of each table

The foundations layout gives every table a heading line. Realm is `audience`, `members` or `operational`. Identity's tables describe the person and how they sign in, whichever side they use, so most are operational.

| Table | Realm | Subject | Append-only | Retention |
| --- | --- | --- | --- | --- |
| `core_accounts` | operational | `id` | No | Anonymised by erasure or by the armed sweeps (`core.retention.unclaimed-after`, `core.retention.dormant-after`); the row is kept as a tombstone |
| `core_account_emails` | operational | `account_id` | No | With the account; an unverified address goes after `core.sign-in.unverified-address-lifetime` |
| `core_passkeys` | operational | `account_id` | No | With the account |
| `core_federated_identities` | operational | `account_id` | No | With the account |
| `core_recovery_codes` | operational | `account_id` | No | With the account |
| `core_account_tokens` | operational | `account_id`, or the email column when no account is named | No | Deleted a day after expiry |
| `core_passkey_challenges` | operational | `account_id` where one is named, otherwise none | No | Deleted on expiry |
| `core_sessions` | operational | `account_id` | No | Deleted 30 days after ending or expiring |
| `core_roles` | operational | none | No | Kept |
| `core_role_abilities` | operational | none | No | Kept |
| `core_fact_abilities` | operational | none | No | Kept |
| `core_grants` | operational | `account_id`; `granted_by` is an actor | Yes | Ended rows are kept as the record of who held what |
| `core_account_merges` | operational | `survivor_id` | No | Kept |
| `core_account_merge_items` | operational | none (reached through the merge) | No | Deleted when the undo window closes |
| `core_data_requests` | operational | `account_id` | No | Kept as the record that the request was met; it holds no personal content after erasure |
| `core_emergency_contacts` | members | `account_id` | No | With the account, and deleted `core.emergency-contacts.keep-after-standing` after the last standing ends |
| `core_access_profiles` | audience | `account_id` | No | With the account; a special column under `CORE_ENCRYPTION_KEY` |

`core_access_shares` has the same heading line as `core_access_profiles`: realm `audience`, subject `account_id`, kept with the account. Two of identity's tables are append-only, core\_grants and core\_grant\_ends (realm operational, kept as the record of who held what); none of the others is. core\_grant\_warnings is an ordinary table. The audit trail of its actions is foundations' `core_audit`.

### Id prefixes

Every id is a prefix, an underscore and 26 characters, in the foundations format. Ids sort by creation time unless marked random; an id is random where it acts as a secret or where the moment of creation should not show.

| Table | Prefix | Random |
| --- | --- | --- |
| `core_accounts` | `acc` | No |
| `core_account_emails` | `aem` | No |
| `core_passkeys` | `pky` | No |
| `core_federated_identities` | `fid` | No |
| `core_recovery_codes` | `rcc` | Yes |
| `core_account_tokens` | `tok` | Yes |
| `core_passkey_challenges` | `pch` | Yes |
| `core_sessions` | `ses` | Yes |
| `core_roles` | `rol` | No |
| `core_grants` | `gra` | No |
| `core_account_merges` | `mrg` | No |
| `core_account_merge_items` | `mrgi` | No |
| `core_data_requests` | `dreq` | No |
| `core_emergency_contacts` | `emc` | No |
| `core_access_profiles` | none | No |

`core_role_abilities` and `core_fact_abilities` have no id of their own. The first is keyed by `role_id` and `ability` together; the second by `fact`, `ability` and `pinned_record` together. The id of a session, token or challenge is never the secret itself: the secret is a separate value stored only as a hash.

`core_access_profiles` has no id of its own either: a person has at most one application, so the row is keyed by `account_id` and anything that points at it names the account.

## core\_accounts

One row per person. Kept for ever as a tombstone after erasure, so that history elsewhere still has something to point at.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept |
| name | text | Not null while live; 1 to 120 characters | Personal | Set to null |
| preferred\_name | text | Null; up to 60 characters. Kept but no longer asked for or shown (ID-11) | Personal | Set to null |
| phone | text | Null; stored in international form | Personal | Set to null |
| locale | text | Null; a language tag the platform ships | Internal | Set to null |
| audience\_email\_id | id | Null; refers to a core\_account\_emails row of this account | Internal | Set to null |
| members\_email\_id | id | Null; refers to a core\_account\_emails row of this account. Null means "use the audience address" | Internal | Set to null |
| origin | enum | `setup`, `self`, `guest`, `named-by-other`, `invite`, `staff`. `invite` is an account made by an invitation or by a role granted to an address nobody holds. `staff` is a person added by staff in the console or at the desk, including a name on the door list with no address. `named-by-other` is a person whose details somebody else gave. | Internal | Kept |
| created\_at | time | Not null | Internal | Kept |
| first\_signed\_in\_at | time | Null until the first successful sign-in | Internal | Kept |
| last\_signed\_in\_at | time | Null | Personal | Set to null |
| disabled\_at | time | Null | Internal | Kept |
| disabled\_reason | enum | Null; security, conduct, requested, duplicate | Internal | Kept |
| merged\_into\_id | id | Null; refers to core\_accounts; never its own id | Internal | Kept |
| merged\_at | time | Null; set with merged\_into\_id | Internal | Kept |
| anonymised\_at | time | Null | Internal | Set to now |

- **A trigger guards the tombstone.** Once `anonymised_at` is set, any write to a Personal column of the row is refused by the database, not by application code.
- **A second trigger refuses deletion** of any row.
- **Derived, never stored:** *unclaimed* is `first_signed_in_at` null on a live row; *claimed* is the opposite; *alias* is `merged_into_id` set; *tombstone* is `anonymised_at` set.
- On merge: the merged-away account's row stays, gains `merged_into_id`, and loses nothing else until the undo window closes.

## core\_account\_emails

An address belongs to one account at a time.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null; refers to core\_accounts | Internal | Row deleted |
| address | text | Not null; trimmed and lower-cased; unique across the table | Personal | Row deleted |
| verified\_at | time | Null until the mailbox is proved | Internal | Row deleted |
| added\_by | enum | self, checkout, staff, provider | Internal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |

- The unique index on `address` is the conditional write that stops two accounts being made for one address at the same moment.
- On merge: rows move to the survivor.

## core\_passkeys

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| credential\_id | text | Not null; unique | Internal | Row deleted |
| public\_key | text | Not null | Internal | Row deleted |
| sign\_count | integer | Not null; default 0 | Internal | Row deleted |
| transports | text | Null; a list as the browser reported it | Internal | Row deleted |
| authenticator | text | Null; the authenticator model identifier | Internal | Row deleted |
| synced | flag | Not null; whether the passkey is backed up by its provider | Internal | Row deleted |
| label | text | Not null; up to 60 characters; the person's own name for it | Personal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |
| last\_used\_at | time | Null | Personal | Row deleted |

On merge: rows move to the survivor, so both sets of passkeys keep working.

## core\_federated\_identities

A link between an account and an identity at an outside provider. Google is the first.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| provider | text | Not null; a registered sign-in provider | Internal | Row deleted |
| subject | text | Not null; unique together with provider | Personal | Row deleted |
| hosted\_domain | text | Null; the organisation domain the provider vouched for | Internal | Row deleted |
| email\_id | id | Null; the core\_account\_emails row the provider asserted | Internal | Row deleted |
| linked\_at | time | Not null | Internal | Row deleted |
| last\_used\_at | time | Null | Personal | Row deleted |

On merge: rows move to the survivor.

## core\_recovery\_codes

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| code\_hash | text | Not null; unique | Internal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |
| used\_at | time | Null; set by a conditional write so a code works once | Internal | Row deleted |

On merge: the merged-away account's codes are deleted; the survivor keeps its own.

## core\_account\_tokens

Every single-use secret sent to a person or handed to them by staff. Only a hash is stored.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| purpose | enum | sign\_in, verify\_address, invite, enrol\_passkey, confirm\_merge, confirm\_erasure | Internal | Row deleted |
| token\_hash | text | Not null; unique | Internal | Row deleted |
| code\_hash | text | Null; the short code that travels with a sign-in link | Internal | Row deleted |
| browser\_hash | text | Null; binds the short code to the browser that asked for it | Internal | Row deleted |
| account\_id | id | Null; null when the address has no account yet | Internal | Row deleted |
| address | text | Null; the address the token was sent to | Personal | Row deleted |
| issued\_by | id | Null; the staff account, for invite and enrol\_passkey | Internal | Kept on other people's rows |
| next\_path | text | Null; a path on this site only | Internal | Row deleted |
| attempts | integer | Not null; default 0; wrong codes tried | Internal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |
| expires\_at | time | Not null | Internal | Row deleted |
| used\_at | time | Null; set by a conditional write | Internal | Row deleted |

- A sweep deletes rows a day after they expire.
- **A new address has no account until its token is used.** Signing up writes a token, not an account, so no unverified account ever exists.
- On merge: the merged-away account's unused tokens are deleted.

## core\_passkey\_challenges

The short-lived challenge behind a passkey ceremony. It is a table and not a cache entry, because it must be read back exactly once and immediately; Mailflare keeps its WebAuthn challenges in the database for the same reason (see Sources).

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| purpose | enum | register, sign\_in, reassert | Internal | Row deleted |
| challenge | text | Not null | Internal | Row deleted |
| account\_id | id | Null | Internal | Row deleted |
| session\_id | id | Null; set for reassert | Internal | Row deleted |
| expires\_at | time | Not null | Internal | Row deleted |
| used\_at | time | Null; set by a conditional write | Internal | Row deleted |

## core\_sessions

One row per signed-in browser. The cookie holds a random token; the table holds its hash.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| token\_hash | text | Not null; unique | Internal | Row deleted |
| methods | text | Not null; the list of methods that proved this session: passkey, email, a provider key, recovery\_code | Internal | Row deleted |
| assurance | enum | basic, strong | Internal | Row deleted |
| reasserted\_at | time | Null; the last fresh proof inside this session | Internal | Row deleted |
| device | text | Not null; a short label worked out from the browser, such as "Safari on iPhone" | Personal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |
| last\_seen\_at | time | Not null; refreshed at most once every few minutes | Personal | Row deleted |
| expires\_at | time | Not null | Internal | Row deleted |
| ended\_at | time | Null | Internal | Row deleted |
| ended\_reason | enum | Null; signed\_out, ended\_by\_person, ended\_by\_staff, credential\_changed, disabled, merged, erased | Internal | Row deleted |

- No network address is stored.
- A sweep deletes rows 30 days after they end or expire.
- On merge: the merged-away account's sessions are ended with reason `merged`.

## core\_roles

Roles are rows a theatre edits. The platform ships presets and one fixed role, Owner.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Not personal |
| key | text | Not null; unique; a slug that never changes | Internal | Not personal |
| name | text | Not null; the theatre's own word for it | Internal | Not personal |
| description | text | Null | Internal | Not personal |
| fixed | flag | Not null; true only for Owner, which cannot be edited or archived | Internal | Not personal |
| opens\_members\_area | flag | Not null; holding this role is a standing | Internal | Not personal |
| needs\_managed\_identity | flag | Not null; a grant is refused unless the account has a sign-in on a managed domain | Internal | Not personal |
| expiry\_rule | enum | year\_end, days, none | Internal | Not personal |
| expiry\_days | integer | Null unless expiry\_rule is days | Internal | Not personal |
| preset | text | Null; the preset role this was copied from | Internal | Not personal |
| created\_at | time | Not null | Internal | Not personal |
| archived\_at | time | Null; an archived role can no longer be granted | Internal | Not personal |

## core\_role\_abilities

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| role\_id | id | Not null; primary key with ability | Internal | Not personal |
| ability | text | Not null; a key in the ability registry | Internal | Not personal |

An ability key the registry no longer knows is ignored by the resolver and flagged on the role's screen. Owner has no rows here: it holds every ability by rule.

## core\_fact\_abilities

Which abilities the theatre has attached to a fact a module declares. It is the same shape as a role's abilities, with the fact's name in place of a role.

| Column | Type | Rules | Class | On erasure |
| --- | --- | --- | --- | --- |
| `fact` | text | Not null; a fact name from an enabled module's manifest | Internal | Kept |
| `ability` | text | Not null; an ability from the registry | Internal | Kept |
| `confirmed_privileged_at` | instant | Null; set when staff explicitly confirmed a privileged ability for this fact, and required for one | Internal | Kept |
| `created_by` | id | Not null; an account, as actor | Internal | Kept |
| `created_at` | instant | Not null | Internal | Kept |

- Key: `fact`, `ability` and `pinned_record` together.
- **On merge:** `created_by` is an alias.
- A row whose fact or ability no longer exists in any enabled module is ignored by the resolver and listed on the health page.

**Pinned mappings.** A fact declared `pin: true` may be mapped for one record of the type it is on, such as one competency. The table therefore has a sixth column, and its key is `fact`, `ability` and `pinned_record` together.

| Column | Type | Rules | Class | On erasure |
| --- | --- | --- | --- | --- |
| `pinned_record` | text | Not null; empty for a mapping that applies to every record, otherwise the id of one record of the fact's `on` type. Only a fact declared `pin: true` may have a non-empty value. | Internal | Kept |

A pinned mapping allows the ability only when the fact holds for the actor on that record. A mapping whose record no longer exists grants nothing and is shown as broken on the roles screen.

## core\_grants

A role given to an account. Append-only: a grant row is written once and never changed. Ending a grant writes a row to `core_grant_ends`; changing a grant's end or scope ends it as replaced and writes a new grant; a renewal is a new grant. The history therefore answers who could do what on any past date.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `id` | id | Primary key | Internal | Kept; a live grant is ended |
| `account_id` | id | Not null | Internal | Kept |
| `role_id` | id | Not null | Internal | Kept |
| `scope` | enum | `site`, `module`, `record` | Internal | Kept |
| `scope_module` | text | Null unless scope is module or record | Internal | Kept |
| `scope_type` | text | Null unless scope is record; a record type its module registered as grantable | Internal | Kept |
| `scope_id` | id | Null unless scope is record | Internal | Kept |
| `starts_at` | time | Not null | Internal | Kept |
| `expires_at` | time | Null means no expiry | Internal | Kept |
| `granted_by` | id | Not null; never equal to `account_id`, by check constraint, except on the setup grant | Internal | Kept |
| `granted_at` | time | Not null | Internal | Kept |

- A grant is *live* when `starts_at` has passed, `expires_at` is null or still to come, and it has no row in `core_grant_ends`. *Lapsed* and *pending* are read at query time too. Pending means the account is unclaimed.
- One live grant per account, role and scope. An index cannot see the ends table, so the rule is a condition on the statement that writes the grant: it writes nothing if a live grant for the same account, role and scope exists, counting through the account scope. The unit knows the grant was written because the kit's guard passed, not from a count of rows changed.
- On merge: `account_id` is `alias`, as it must be in an append-only table, so both accounts' grants are read as the survivor's from stage one. Where both hold the same role at the same scope, a handler ends the one with the earlier expiry as replaced. On undo that grant cannot be un-ended, so the handler's undo writes a new grant to the returned account with the same role, scope and expiry, if it would still be live.

## core\_grant\_ends

That a grant was ended, by whom and why. Append-only; one row per grant at most.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `grant_id` | id | Primary key; a grant in `core_grants` | Internal | Kept |
| `ended_at` | time | Not null | Internal | Kept |
| `ended_by` | id | Null when the system ended it; an actor, `alias` on merge | Internal | Kept |
| `ended_reason` | enum | `revoked`, `replaced`, `role_archived`, `account_closed`, `merged` | Internal | Kept |

It has no id or prefix of its own and no free text. Erasure writes a row here with the reason `account_closed` for each of the person's live grants; it changes no existing row, so the trigger needs no exception.

The ability check reads a grant as live in one statement: the grant row and the absence of a `core_grant_ends` row for it are tested together, never in two reads, so a grant ended a moment ago cannot allow anything. An audit entry's `allowed_by` still names the grant's id.

## core\_account\_merges and core\_account\_merge\_items

The record of a merge, and the list of what it moved so that it can be undone. Besides the columns below, `core_account_merges` has `completed_at` (timestamp, null while rows are still moving) and `undo_started_at` (timestamp, null unless an undo is under way or done); both Internal and kept on erasure. `core_account_merge_items` is unique on merge, table and row, so listing a row twice does nothing, and has `kind` (enum: `moved`, `set-aside`, `set-aside-keep`; Internal). A set-aside item names a row a handler took out of use: `set-aside` rows are deleted when the undo window closes, `set-aside-keep` rows are left to the module's own retention. How the row is out of use meanwhile is the module's own state, and no column is added to a module's table for it.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept |
| `survivor_id` | id | Not null | Internal | Kept |
| `merged_account_id` | id | Not null; unique among merges not undone | Internal | Kept |
| started\_by | enum | person, staff, claim | Internal | Kept |
| performed\_by | id | Not null | Internal | Kept |
| performed\_at | time | Not null | Internal | Kept |
| undo\_until | time | Not null | Internal | Kept |
| undone\_at | time | Null | Internal | Kept |
| undone\_by | id | Null | Internal | Kept |

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| merge\_id | id | Not null | Internal | Rows deleted |
| table\_name | text | Not null | Internal | Rows deleted |
| column\_name | text | Not null | Internal | Rows deleted |
| row\_id | id | Not null | Internal | Rows deleted |
| action | enum | moved, ended, deleted | Internal | Rows deleted |

Items are deleted by a sweep when `undo_until` passes; after that the merge is permanent and the merged-away account's row is anonymised.

## core\_data\_requests

A request to download or erase a person's data, by them or by staff for them.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept |
| account\_id | id | Not null | Internal | Kept |
| kind | enum | export, erasure | Internal | Kept |
| state | enum | requested, confirmed, held, running, done, cancelled, failed | Internal | Kept |
| requested\_by | id | Not null; the person or the staff member | Internal | Kept |
| requested\_at | time | Not null | Internal | Kept |
| respond\_by | time | Not null; requested\_at plus the response-days setting | Internal | Kept |
| not\_before | time | Null; the end of the cooling-off period for an erasure | Internal | Kept |
| holds | text | Null; a list of hold codes that modules raised, never free text | Internal | Kept |
| file\_id | id | Null; the export, held by Files | Internal | File deleted, column set to null |
| finished\_at | time | Null | Internal | Kept |

## core\_grant\_warnings

That a grant's coming end has been announced, so nobody is told twice. `core_grants` is append-only and cannot carry the mark itself. Columns: `grant_id` (id, primary key, so one row per grant and no id or prefix of its own) and `warned_at` (timestamp, not null). Both Internal. It has no account column and no free text, so merge and erasure do not touch it. Realm operational, append-only: no. It is an ordinary table whose rows are simply never updated, and the daily sweep may delete a row once its grant has lapsed or ended.

## core\_emergency\_contacts

Somebody to ring for a member: up to three per account. Members' side only. A row can be written and read only while the account has a standing, and rows are deleted `core.emergency-contacts.keep-after-standing` after the last standing ends. It describes a third person, so it is never shown outside the members' side and never appears in a list, a search or anybody else's export. Rules are in part 3.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| name | text | Not null | Personal | Row deleted |
| relationship | text | Null; up to 40 characters | Personal | Row deleted |
| phone | text | Not null | Personal | Row deleted |
| updated\_at | time | Not null | Internal | Row deleted |

On merge: rows move; the survivor's rows are listed first.

## core\_access\_profiles

A person's application to the access scheme and, once accepted, the needs in force. Audience side: any claimed account may have one, member or not. At most one row per account. The sensitive content (entry ids from the access-needs vocabulary with their notes, the number of companions, the reviewer's message) is held in special columns because it may reveal health. Who else may see it is in `core_access_shares`. The states and rules are in part 3.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `account_id` | id | Primary key | Internal | Row deleted |
| `status` | enum | Not null; `submitted`, `more-info`, `accepted`, `rejected` | Special category | Row deleted |
| `payload` | special | Null until accepted; the needs and companions in force | Special category | Row deleted |
| `pending` | special | Null; an application or a change waiting for a decision | Special category | Row deleted |
| `message` | special | Null; the reviewer's latest message to the person | Special category | Row deleted |
| `submitted_at` | timestamp | Not null | Internal | Row deleted |
| `submitted_via` | enum | Not null; `self`, `staff` | Internal | Row deleted |
| `submitted_by` | id | Null; the staff account when `submitted_via` is `staff`; an actor reference | Internal | Row deleted |
| `decided_at` | timestamp | Null | Internal | Row deleted |
| `decided_by` | id | Null; an actor reference | Internal | Row deleted |
| `verified_at` | timestamp | Null; set only while `status` is `accepted` | Internal | Row deleted |
| `verified_by` | id | Null; an actor reference | Internal | Row deleted |
| `verified_method` | enum | Null; `access-card`, `document`, `known` | Special category | Row deleted |
| `review_due` | date | Null; set on acceptance | Internal | Row deleted |
| `options_seen_at` | timestamp | Null; when the person said none of the entries added since they applied helps | Internal | Row deleted |
| `updated_at` | timestamp | Not null | Internal | Row deleted |

- Withdrawing deletes the row, so `withdrawn` is not a stored status.
- A check constraint holds `payload` not null exactly when `status` is `accepted`, and `verified_at` null unless it is.
- While `status` is `accepted` and `pending` is not null, a change is waiting and `payload` stays in force.
- No card number, document or image is stored. `verified_method` says only what kind of evidence a reviewer saw.
- The row is never selected by a list or a search outside the scheme's review queue, which reads `status` and `submitted_at` only.

On merge: the survivor's row stays; if only the merged-away account has one, it moves.

## core\_access\_shares

One row for each purpose the person has agreed may see their access needs. No row means no sharing. A purpose is declared by a module through the point `core.access-purpose` (part 4).

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `account_id` | id | Not null; part of the key | Internal | Row deleted |
| `purpose` | text | Not null; part of the key; a declared purpose id such as `box-office.booking` | Internal | Row deleted |
| `created_at` | timestamp | Not null | Internal | Row deleted |

- Key: `account_id` and `purpose` together. No id of its own.
- A row whose purpose is no longer declared (its module is switched off) counts for nothing and is kept, so switching the module back on restores the person's choice.
- On merge: rows move to the survivor; where both have the same purpose, one row remains.

## What other modules declare about an account reference

In the foundations formats this is written `col.account(name, { role: 'subject' | 'actor', onMerge: 'move' | 'alias' | 'handler' })` on the column, and `onErasure: 'keep-row' | 'delete-row'` on the table, with the `core.erasure-handler` point for anything else. A check forces `alias` on an append-only table.

Every column elsewhere that holds an account id states two things in its data-class entry.

| Declaration | Choices | Meaning |
| --- | --- | --- |
| On merge | move | The row is re-pointed at the survivor. Used for mutable rows: a booking, a shift, a basket. |
|  | alias | The row is left alone and reads follow `merged_into_id`. Required for append-only tables, which cannot be updated. |
|  | handler | The module supplies the statements, for rows with a uniqueness rule that a plain move would break. |
| On erasure | keep | The id stays and now points at a tombstone. Used for ledger lines, attendance, safety records. |
|  | delete | The row goes. Used for consent-based data. |
|  | handler | The module supplies the statements. |

A build check fails on an account reference with neither declared.

## Room left for later

- **A household** would be a new table linking accounts, with one of them able to act for the others. No column above assumes an account holder is an adult acting alone.
- **A password provider** would add one table of its own. No column above stores a secret the person knows.
- **A service account** would be a `core_accounts` row with a new `origin` and its own credential table.
