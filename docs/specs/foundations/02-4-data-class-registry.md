# Data-class registry

Every column is declared through a helper that names its data class, so a column with no class cannot be written. Erasure, a person's data download and the theatre's record of what it holds are all generated from these declarations.

## A table

```ts
// layers/lost-property/server/db/schema.ts
import { defineTable, col } from '#kit/db'
import { text } from 'drizzle-orm/sqlite-core'

export const claims = defineTable('lost_property_claims', {
  id:          col.id(),
  itemId:      col.ref('lost_property_items'),
  accountId:   col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  email:       col.email('contact_email'),
  phone:       col.personal(text('phone'), { erase: 'clear' }),
  note:        col.freeText(text('note')),
  accessNeeds: col.special('access_needs'),
  state:       col.internal(text('state').notNull()),
  handledBy:   col.account('handled_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt:   col.createdAt(),
}, {
  id: 'xlpc',
  realm: 'audience',
  subject: { account: 'account_id', email: 'contact_email', unlinked: 'staff' },
  redact: 'lost-property.claim.redact',
  retention: 'lost-property.claims.keep-for',
})
```

The arguments are the name, the columns, then the options. The column builders are Drizzle's own; `col.*` wraps one and records its class. `defineTable` refuses a column that was not wrapped, and refuses a table name that does not start with its module's prefix. The example is from the invented lost-property module, so its id prefix starts with `x`, as a theatre's own module's would.

## Classes

| Class | Helper | Examples | Default on erasure | May be changed to |
| --- | --- | --- | --- | --- |
| Public | `col.public()` | Production title, a credited name with consent | `keep` | `anonymise` |
| Internal | `col.internal()` | A state, a stock level, a total | `keep` | none |
| Personal | `col.personal()` | Email, phone | `anonymise` | `clear`, `retain` |
| Personal free text | `col.freeText()` | An incident description, a note | `redact` | `clear`, `retain` |
| Special category | `col.special()` | Access needs, health details | `clear` | none |
| Decided per row | `col.perRow()` | A form answer whose class the theatre chose per field | per row | none |

- **Special category columns are always encrypted by the helper**, before the value reaches the database. `col.internal()` and `col.personal()` take `encrypted: true` for a value that is not special but must not sit in the clear, such as a webhook's secret or a push subscription's keys. All of them use the one core key, `CORE_ENCRYPTION_KEY`, and store its version beside the value so the key can be rotated; no module brings a key of its own. An encrypted column cannot be searched or indexed, and `col.special()` takes only a column name for that reason.
- **`col.perRow(builder, { classColumn })`** names a sibling column holding one of the five fixed classes for each row. Erasure and export read it row by row. It exists for the form builder; a specification that uses it elsewhere should say why.
- Identifiers, foreign keys, timestamps and money are internal, and their helpers say so for you.

## Erasure behaviours

| Behaviour | What happens to the value |
| --- | --- |
| `keep` | Nothing |
| `anonymise` | Replaced with a fixed placeholder ("Former member"), or a per-row one where the column is unique |
| `redact` | Replaced with a marker that text was removed |
| `clear` | Set to null |
| `retain` | Kept until a stated period ends, then treated as its class's default. Needs `until` (a duration setting) and `reason` (a translation key) |

A behaviour other than the default is the second argument: `col.personal(text('email'), { erase: 'clear' })`.

**An internal column may be cleared on erasure (ruled 16 November 2026, raised by the box office build).** `col.internal(column, { erase: 'clear' })` is for a value that is not personal data but must not outlive the person's link to the row: the hash of a secret link token, the hash of a desk code, a resume token. Erasure sets it to null in the same unit as the row's personal columns; it never appears in a download, is never shown and is never searched. As built (kit pull request 88): the column must be nullable and its table must reach a person, that is, declare a subject with an account or an email, or inherit one from a parent row with subject: { via }, through as many parents as it takes (a ticket through its order line to its order); this is stricter than refusing subject none alone, and it is the rule. Erasing the person clears the column on the inherited rows in the same unit. `clear` is the only erasure behaviour an internal column takes. A module does not declare such a column `col.personal` to get the behaviour: a personal column is offered in the person's download, and a hash has no place there.

**A kept credential: encrypted, internal, cleared (ruled 16 November 2026, raised by the box office specification).** A code that must be shown or sent again to its holder, such as a ticket's or a pass's code, is declared with what the format already has: `col.internal(column, { encrypted: true, erase: 'clear' })`. It is not special and is not classed so to get encryption. The declaration gives it these properties, and the schema and conformance checks hold a module to them: encrypted with the core key before it reaches the database; never searched, indexed or sorted; set to null by erasure and by the table's retention, and by the module's own unit when the thing is voided; never in a download, an export, an event, a job payload, a log or audit detail. It is read only through the kit's reader for encrypted columns, called from the module's own service, and each caller is named in the module's specification with the ability or proof that admits it; a read by staff is under an ability with `audit: 'read'`. Scanning uses a hash column beside it, never the decrypted value. This is not an exception to the link-token rules: a link token is never kept, because a new one can be issued, while a ticket's code is the ticket and must stay the same.

**As built (kit pull request 88, 16 November 2026).** An internal column may be both encrypted and cleared on erasure, on a table whose subject is its own or inherited through `via`; erasure runs deepest child first and the account last. The kit writes and reads an encrypted column with one pair of functions exported from `#kit`. As first built they are `sealSpecial(value)` and `openSpecial(value)`; because a value that is not special now passes through them, they are to be exported also as `sealColumn` and `openColumn`, which is what a module uses for a column declared `encrypted: true`, keeping the `Special` names for special columns. Whatever the name, the sealed value goes into a column declared encrypted and nowhere else (link-token rule T3). An encrypted column is refused as a search field and as a sort. Both names are exported as of kit pull request 100. The conformance check makes the two refusals it can, for both names: no sealing in a module that has no special or encrypted column, and no sealing of something named as a token or link. That the sealed value goes into an encrypted column and nowhere else cannot be checked by a tool and is a rule for review.

Erasure of one person is a single unit of work built from the registry: every table whose `subject` reaches that account, every non-`keep` column. A module adds an entry to the point `core.erasure-handler` only for what a column rule cannot express, such as deleting a stored file.

## Table options

| Option | Required | Meaning |
| --- | --- | --- |
| `id` | Yes, unless the table is keyed by its own columns | The table's id prefix: two to four lower-case letters, unique across the system, starting with `x` in a theatre's own module. Every id is the prefix, an underscore and 26 characters that sort by creation time. Part 4 keeps the index of prefixes |
| `random` | No | `true` makes the 26 characters random, so an id does not reveal when the row was made. An id is still never a secret |
| `realm` | Yes | `audience`, `members`, `operational` or `system`. Keeps a customer's orders and a volunteer's training record apart in exports, in the privacy record and in who may see them. `system` is for the platform's own tables. `{ column: 'realm' }` lets the realm differ by row |
| `subject` | Yes | How a row reaches the person it is about. See Subjects below |
| `redact` | With `unlinked: 'staff'` | The ability that lets staff search the table for a person and redact their rows |
| `retention` | No | A duration setting. A scheduled sweep erases or deletes rows older than it. A fixed duration, written { fixed: '30d' }, is allowed only on a table with subject none and no personal, special or free-text column (a technical record such as core\_email\_events\_set\_aside); anything about a person is kept for a time the theatre can set. As built (kit pull request 88), a fixed retention has no generic sweep: the module reads retentionSeconds(table) and deletes its own old rows in a task it declares |
| `appendOnly` | No | Rows are never edited or deleted. The build writes the triggers that enforce it |
| `onErasure` | No, default `keep-row` | `delete-row` removes the whole row, for tables with no value once the person is gone, such as saved preferences |

## Subjects

| Declaration | Means |
| --- | --- |
| A `col.account(..., { role: 'subject' })` column | The row is about that account. The subject is inferred from the column; nothing more is declared |
| `subject: { via: 'order_id' }` | Inherited from a parent row |
| `subject: { email: 'contact_email' }` | A person with no account, found by an address. The column is `col.email`. Erasure and download for an account also sweep these rows for every address verified on the account |
| `subject: { account: 'account_id', email: 'contact_email' }` | Both. The account wins: a row with an account belongs to it and its email is only a contact detail. A row with no account is found by its email. A row that names another account is never matched by email |
| `unlinked: 'staff'`, added to either form, or alone | Rows that can be linked to nobody (a nullable account that is empty and no email, or a table with neither column, such as a list of names supplied by another body). They hold personal details in classed columns, need a `retention` and a `redact` ability, and appear on the erasure and download screens as a manual step |
| `subject: 'none'` | The table holds nothing about a person |

- A nullable account subject without `unlinked` is refused by the schema check.
- A table with `subject: 'none'` may not hold a personal or special column. It may hold a free-text column that could describe a person only if the column is `col.freeText` with an erasure behaviour and the table declares a `retention`, because the sweep is the only thing that will ever remove it.
- A row concerning several people declares a list of subjects.
- **Append-only and erasure together:** in an append-only table, an erasable column may be changed only to its erased value, and the trigger checks that every other column is unchanged. History survives; the person does not.
- A migration that would rebuild an append-only table is refused by a check.
- Nuxt Content's `_content_*` tables are outside the registry and the migration runner.

## Column helpers

| Helper | SQL | Holds |
| --- | --- | --- |
| `col.id()` | `text primary key` | The table's scoped id: its declared prefix, an underscore and 26 characters. No table carries another system's ids |
| `col.ref(table)` | `text references` | A foreign key, accepting only that table's prefix. A module may reference its own tables, the core's, and those of modules in `requires` |
| `col.account(name, { role, onMerge })` | `text references core_accounts` | A reference to an account. Always used in place of `col.ref('core_accounts')` |
| `col.email(name)` | `text` | An email address, personal, stored trimmed and lower-cased so it can be matched |
| `col.createdAt()`, `col.updatedAt()`, `col.timestamp(name)` | `integer` | An instant in UTC milliseconds |
| `col.localDate(name)` | `text` | A calendar date in the theatre's time zone, `YYYY-MM-DD`, for things that are dates and not instants |
| `col.minor(name)`, `col.currency(name)` | `integer`, `text` | Money in minor units, and its ISO 4217 code |
| `col.real(name)` | `real` | A measurement that is not whole, such as a latitude. Never money, a count or a percentage |
| `col.public()`, `col.internal()`, `col.personal()`, `col.freeText()`, `col.special()`, `col.perRow()` | as wrapped | Everything else |

`col.perRow(builder, { classColumn })` takes its class from a sibling column; `classFrom: { via: 'file_id', column: 'class' }` takes it from a parent row.

**Columns that refer to an account** take two options:

| Option | Values | Meaning |
| --- | --- | --- |
| `role` | `subject`, `actor` | `subject`: the row is about this person, so erasure and export reach it. `actor`: the person did something to the row (approved it, sold it); the reference is kept and follows a merge |
| `onMerge` | `move`, `alias`, `handler` | What merging two accounts does: rewrite the column, leave it and let reads follow the merged account, or call the module's contribution to workstream 2's merge point |

A check requires `alias` in an append-only table, because a merge cannot rewrite it. The audit table is the first example: its actor column is `alias`.

**How a merge scales, and what that asks of a column (agreed with identity, 16 November 2026; the Identity Doc, part 3, Merge, defines the flow).**

- **`alias` is the default**, and `onMerge` may be left out to mean it. The column keeps the id it was written with, and reads follow the merge. Actor columns and every account column in an append-only table are `alias`.
- **`move` is for a column whose stored id must be the survivor's**: it is part of a unique rule, or it is the person's own living record that other tables key to. The check asks for a one-line reason beside every `move`.
- **`handler` is for a table where both accounts may hold a row that a person may hold only once.** A handler receives the survivor, the merged-away account and the merge id, fits one unit, is safe to run twice, and lists every row it changes through the kit's helper so the merge can be undone.
- **Reads use the account scope.** Because most columns are `alias`, and because a merge moves rows in stages as a job, every read by account, and every count or claim condition on a statement, goes through the kit's account scope: the survivor and its aliases, as a subquery, never a list of ids. The kit provides it for `move` and `alias` columns alike, and the conformance check refuses a condition that compares an account column to an id directly. The kit's own erasure, export and retention use it too. Going the other way, from a stored id to the person, a helper resolves a merged-away id to its survivor.
- **The move is a job, not one unit.** Identity's first unit records the merge and changes only identity's tables. The job `core.merge-move` then takes modules in registry order: each `move` column is one statement that lists the rows in the merge items and one that rewrites them where the column still holds the merged-away id, so a unit never grows with the number of rows and every statement can be repeated. A module's last unit carries a guard that none of its `move` columns still points at the merged-away account. Undo runs the same job backwards from the listed rows, only once the merge is complete.

* **Handlers run first.** Within a module, every handler runs before that module's `move` columns are re-pointed, and identity's first unit touches identity's tables only, so a handler sees its module's rows as they were.
* **A handler may answer "not yet"** (a row is mid-payment, say). That module's handlers and moves wait, the job carries on with the other modules and comes back with a growing pause, and the merge stays "still moving". A "not yet" is not a failed attempt and never makes the job dead; a merge still waiting after a day raises a health warning that names the module.
* **A handler may supply its own undo.** Where a change cannot be undone by restoring the listed values (a total that has since grown), the handler gives undo statements of its own: one unit, safe to repeat. On undo each module's steps run in exact reverse: its move columns are pointed back first and its handlers' undo runs after, so an undo that reopens a once-per-person row does not break the unique rule while the row still names the survivor. A handler's undo may also answer "not yet", on the same terms. An undo returns a count, with a reason, of what could not be put back; the Merges screen shows it and the audit entry carries it. A row a handler takes out of use is not deleted: the handler lists it through the kit's helper as set aside, and the row is kept until the undo window closes, when the close deletes it, unless the handler said to keep it when it listed it: a row that is a record in its own right (a submitted form response) may stay under the module's own retention. Deleting is the default, and the merge item is deleted either way. The mark lives in the merge items, not in a column the kit adds; how the row is out of use meanwhile is the module's own state.

**The account scope: names and signatures (settled 16 November 2026, so every module's stand-in matches).** All five are exported from `#kit`.

```ts
// In a statement: the condition a module writes. Works in a read, an update,
// a count, a claim condition and inside a set-wise INSERT ... SELECT.
inAccountScope(column: AccountColumn, account: string | SQL): SQL
//   => column IN (<accountScope(accountId)>)

// The subquery itself, for joins and for conditions the helper above does not fit.
accountScope(account: string | SQL): SQL
//   => SELECT :s AS id UNION SELECT id FROM core_accounts WHERE merged_into_id = :s
//      where :s is the survivor of accountId, resolved inside the same statement

// Outside a statement: the ids, for display, logs and tests. Never bound into an IN list.
accountScopeIds(accountId: string): Promise<string[]>   // survivor first

// Already built: a stored id to its survivor.
canonicalAccount(accountId: string): Promise<string>

// The one escape: compare to exactly this id (identity's own tables, and the
// merge job's "where the column still holds the merged-away id").
exactAccount(column: AccountColumn, accountId: string): SQL
```

`accountScope` accepts either a survivor's id or a merged-away id and gives the same set, because it resolves the survivor inside the statement; a unit therefore needs no read first (rule U4). The conformance check refuses `eq`, `inArray` or raw SQL that compares a `col.account` column to a value in any module, and accepts only `inAccountScope`, a join on `accountScope`, or `exactAccount`; each use of `exactAccount` outside identity needs a one-line reason.

**In a set-wise statement the account is an expression, not a value.** `account` may be an id or an SQL expression, such as the account column of a row read with `json_each`, and the scope is then worked out for each row inside the one statement. That is how a fan-out asks "has anyone in this person's scope already got this?" for many people at once, without a read per person. For the same reason a key that must match across a merge (a notification's dedupe key is the first) is not computed from the account id: the key leaves the account out, and the statement's condition is "the same key, for an account in this row's scope". The kit has no set-wise form of `accountScopeIds`; a module that thinks it needs one should put the comparison in the statement.

**As built (kit pull request 54, 16 November 2026).** The names and signatures above are the kit's. Five points of detail:

- The scope subquery is the survivor itself united with the accounts merged into it, as written above. It gives the same set as before when the account row exists, and an id with no row stands for itself, so a statement never finds an empty scope.
- A job answers "not yet" with `job.defer(code)`. A deferral is counted in `core_jobs.deferrals`, not in attempts, and never makes the job dead.
- A handler's undo answers `{ notRestored, reason }`: the count of what could not be put back and its reason code.
- A set-aside row is listed with `onClose: 'delete'` (the default) or `'keep'`, and its merge item is recorded with kind `set-aside` or `set-aside-keep`.
- A column with role actor is enforced as `alias`: the schema check refuses `move` or `handler` on it.

Of the three registry readers only erasure needed the scope: retention works by age, and export is not built yet and must use `inAccountScope` when it is.

Referencing another module's table by foreign key is reading, and is allowed. Writing to it is not: that goes through its service.

## Migrations

- **Generated, never written by hand.** Change the schema, run `bun run db:generate -- --name <what>`. Triggers for append-only tables are generated too.
- **One journal per owner.** Upstream's migrations live in `migrations/`; a theatre's own module keeps its migrations in `site/migrations/`. Tables reference each other across modules, so within an owner the order has to be one line.
- **Upstream's journal is applied first, then the theatre's.** A theatre's table may reference an upstream table. Upstream never references a theatre's.
- **Every module's tables exist in every deployment**, whether or not the module is switched on.
- **Additive within a major version.** A release adds tables and nullable or defaulted columns. A drop or rename waits for the next major version and is listed in its release notes, because a theatre's table may reference what is dropped.
- **A new feature's tables read as empty until migrated.** Sign-in and the update card must work on a database one release behind, which is the Mailflare port's practice ([PORTING.md](https://github.com/MattA-Official/mailflare/blob/nuxt/docs/PORTING.md)). The kit's query helper treats a missing table as no rows for tables added in the current release.
- **A released migration is never edited.** A check compares each against a recorded hash.

## What is generated

| Output | From | For |
| --- | --- | --- |
| The erasure plan | Classes, erasure behaviours, subjects | The erasure service (workstream 2) |
| A person's data download | Classes and subjects, grouped by realm | "Download my data" |
| The record of personal data held | Every personal, free-text and special column with its retention | The theatre's privacy documentation |
| Append-only triggers | `appendOnly` | Migrations |
| Retention sweeps | `retention` | A core scheduled task |

The point `core.privacy-record` lets a module add entries the schema cannot know, such as the form builder's per-field classes.

## How to write a table in a specification

Part 2 of each specification gives every table in this layout: a heading line, then one row per column.

**`lost_property_claims`**: id prefix `xlpc`; realm audience; subject `account_id`, or `contact_email` where there is no account, unlinked rows for staff (redact ability `lost-property.claim.redact`); retention `lost-property.claims.keep-for`; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `item_id` | ref `lost_property_items` | not null | internal | keep |  |
| `account_id` | account, subject | nullable | internal | keep | Empty for a claim made by someone with no account. On merge: alias |
| `contact_email` | email |  | personal | anonymise |  |
| `phone` | text |  | personal | clear |  |
| `note` | text |  | free text | redact |  |
| `access_needs` | text, encrypted |  | special | clear |  |
| `state` | text | one of a named list | internal | keep | See part 3 |
| `handled_by` | account, actor | nullable | internal | keep | On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

Types to use: id, ref, account, email, text, integer, real, boolean, timestamp, local date, minor units, currency, JSON. Write "encrypted" after the type of a column declared `encrypted: true`.
