# 2. Data model

Identity owns seventeen tables, all inside the `core` module. One row in `core_accounts` is one person; everything else hangs off it. No table stores "is a member", "is staff" or "is pending": those are read from facts at the moment they are asked.

## Reading the tables

- **Types.** `id` is the platform's opaque identifier, `time` is a UTC instant, `flag` is true or false, `enum` is text limited by a check constraint. Workstream 1 fixes how each is stored.
- **Prefix.** Tables are named `core_<plural>`, the foundations format, because identity is an area of the always-on `core` module.
- **Class** is the paper's data class: Public, Internal, Personal, Personal free text, Special category.
- **On erasure** says what the erasure batch does to the column on the erased person's own rows.
- **On merge** is given per table: what happens to the losing account's rows.
- **A reference to an account** in any other module's table declares the same two behaviours in its data-class entry. Identity never names another module's table.

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
| `core_access_profiles` | `apr` | No |

`core_role_abilities` and `core_fact_abilities` are keyed by their two columns together and have no id of their own. The id of a session, token or challenge is never the secret itself: the secret is a separate value stored only as a hash.

## core\_accounts

One row per person. Kept for ever as a tombstone after erasure, so that history elsewhere still has something to point at.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept |
| name | text | Not null while live; 1 to 120 characters | Personal | Set to null |
| preferred\_name | text | Null; up to 60 characters | Personal | Set to null |
| phone | text | Null; stored in international form | Personal | Set to null |
| locale | text | Null; a language tag the platform ships | Internal | Set to null |
| audience\_email\_id | id | Null; refers to a core\_account\_emails row of this account | Internal | Set to null |
| members\_email\_id | id | Null; refers to a core\_account\_emails row of this account. Null means "use the audience address" | Internal | Set to null |
| origin | enum | setup, self, guest, invite, staff | Internal | Kept |
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
- **On merge:** the loser's row stays, gains `merged_into_id`, and loses nothing else until the undo window closes.

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
- **On merge:** rows move to the winner.

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

**On merge:** rows move to the winner, so both sets of passkeys keep working.

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

**On merge:** rows move to the winner.

## core\_recovery\_codes

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| code\_hash | text | Not null; unique | Internal | Row deleted |
| created\_at | time | Not null | Internal | Row deleted |
| used\_at | time | Null; set by a conditional write so a code works once | Internal | Row deleted |

**On merge:** the loser's codes are deleted; the winner keeps its own.

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
- **On merge:** the loser's unused tokens are deleted.

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
- **On merge:** the loser's sessions are ended with reason merged.

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

- **Key:** `fact` and `ability` together.
- **On merge:** `created_by` is an alias.
- A row whose fact or ability no longer exists in any enabled module is ignored by the resolver and listed on the health page.

**Pinned mappings.** A fact declared `pin: true` may be mapped for one record of the type it is on, such as one competency. The table therefore has a sixth column, and its key is `fact`, `ability` and `pinned_record` together.

| Column | Type | Rules | Class | On erasure |
| --- | --- | --- | --- | --- |
| `pinned_record` | text | Not null; empty for a mapping that applies to every record, otherwise the id of one record of the fact's `on` type. Only a fact declared `pin: true` may have a non-empty value. | Internal | Kept |

A pinned mapping allows the ability only when the fact holds for the actor on that record. A mapping whose record no longer exists grants nothing and is shown as broken on the roles screen.

## core\_grants

A role given to an account. A grant is never edited: it is ended, and a renewal is a new row.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept, ended |
| account\_id | id | Not null | Internal | Kept |
| role\_id | id | Not null | Internal | Kept |
| scope | enum | site, module, record | Internal | Kept |
| scope\_module | text | Null unless scope is module or record | Internal | Kept |
| scope\_type | text | Null unless scope is record; a record type its module registered as grantable | Internal | Kept |
| scope\_id | id | Null unless scope is record | Internal | Kept |
| starts\_at | time | Not null | Internal | Kept |
| expires\_at | time | Null means no expiry | Internal | Kept |
| granted\_by | id | Not null; never equal to account\_id, by check constraint, except on the setup grant | Internal | Kept |
| granted\_at | time | Not null | Internal | Kept |
| ended\_at | time | Null | Internal | Set to now if still live |
| ended\_by | id | Null | Internal | Kept |
| ended\_reason | enum | Null; revoked, replaced, role\_archived, account\_closed, merged | Internal | Kept |

- A partial unique index allows one live grant per account, role and scope.
- *Live*, *lapsed* and *pending* are read at query time. Pending means the account is unclaimed.
- A trigger allows only the three `ended_` columns to change after insert.
- **On merge:** live rows move to the winner. Where both hold the same role at the same scope, the later expiry stays and the other ends as replaced.

## core\_account\_merges and core\_account\_merge\_items

The record of a merge, and the list of what it moved so that it can be undone.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Kept |
| winner\_id | id | Not null | Internal | Kept |
| loser\_id | id | Not null; unique among merges not undone | Internal | Kept |
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

Items are deleted by a sweep when `undo_until` passes; after that the merge is permanent and the loser's row is anonymised.

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

## core\_emergency\_contacts

Somebody to ring for a member. It describes a third person, so it is never shown outside the members' side.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| id | id | Primary key | Internal | Row deleted |
| account\_id | id | Not null | Internal | Row deleted |
| name | text | Not null | Personal | Row deleted |
| relationship | text | Null; up to 40 characters | Personal | Row deleted |
| phone | text | Not null | Personal | Row deleted |
| updated\_at | time | Not null | Internal | Row deleted |

**On merge:** rows move; the winner's rows are listed first.

## core\_access\_profiles

A person's access needs, given once and offered wherever they are useful. The questions themselves are a form-builder form, so a theatre can change them.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| account\_id | id | Primary key | Internal | Row deleted |
| payload | text | Not null; the answers, encrypted in the application before storage | Special category | Row deleted |
| key\_version | integer | Not null | Internal | Row deleted |
| share\_with\_box\_office | flag | Not null; default false | Internal | Row deleted |
| share\_with\_members\_side | flag | Not null; default false | Internal | Row deleted |
| updated\_at | time | Not null | Internal | Row deleted |

**On merge:** the winner's row stays; if only the loser has one, it moves.

## What other modules declare about an account reference

In the foundations formats this is written `col.account(name, { role: 'subject' | 'actor', onMerge: 'move' | 'alias' | 'handler' })` on the column, and `onErasure: 'keep-row' | 'delete-row'` on the table, with the `core.erasure-handler` point for anything else. A check forces `alias` on an append-only table.

Every column elsewhere that holds an account id states two things in its data-class entry.

| Declaration | Choices | Meaning |
| --- | --- | --- |
| On merge | move | The row is re-pointed at the winner. Used for mutable rows: a booking, a shift, a basket. |
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
