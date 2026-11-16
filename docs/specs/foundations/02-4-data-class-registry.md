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
  accountId:   col.account('account_id', { role: 'subject', onMerge: 'move', nullable: true }),
  email:       col.email('contact_email'),
  phone:       col.personal(text('phone'), { erase: 'clear' }),
  note:        col.freeText(text('note')),
  accessNeeds: col.special('access_needs'),
  state:       col.internal(text('state').notNull()),
  handledBy:   col.account('handled_by', { role: 'actor', onMerge: 'move', nullable: true }),
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

Erasure of one person is a single unit of work built from the registry: every table whose `subject` reaches that account, every non-`keep` column. A module adds an entry to the point `core.erasure-handler` only for what a column rule cannot express, such as deleting a stored file.

## Table options

| Option | Required | Meaning |
| --- | --- | --- |
| `id` | Yes, unless the table is keyed by its own columns | The table's id prefix: two to four lower-case letters, unique across the system, starting with `x` in a theatre's own module. Every id is the prefix, an underscore and 26 characters that sort by creation time. Part 4 keeps the index of prefixes |
| `random` | No | `true` makes the 26 characters random, so an id does not reveal when the row was made. An id is still never a secret |
| `realm` | Yes | `audience`, `members`, `operational` or `system`. Keeps a customer's orders and a volunteer's training record apart in exports, in the privacy record and in who may see them. `system` is for the platform's own tables. `{ column: 'realm' }` lets the realm differ by row |
| `subject` | Yes | How a row reaches the person it is about. See Subjects below |
| `redact` | With `unlinked: 'staff'` | The ability that lets staff search the table for a person and redact their rows |
| `retention` | No | A duration setting. A scheduled sweep erases or deletes rows older than it |
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
| `account_id` | account, subject | nullable | internal | keep | Empty for a claim made by someone with no account. On merge: move |
| `contact_email` | email |  | personal | anonymise |  |
| `phone` | text |  | personal | clear |  |
| `note` | text |  | free text | redact |  |
| `access_needs` | text, encrypted |  | special | clear |  |
| `state` | text | one of a named list | internal | keep | See part 3 |
| `handled_by` | account, actor | nullable | internal | keep | On merge: move |
| `created_at` | timestamp | not null | internal | keep |  |

Types to use: id, ref, account, email, text, integer, real, boolean, timestamp, local date, minor units, currency, JSON. Write "encrypted" after the type of a column declared `encrypted: true`.
