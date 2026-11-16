# Data-class registry

Every column is declared through a helper that names its data class, so a column with no class cannot be written. Erasure, a person's data download and the theatre's record of what it holds are all generated from these declarations.

## A table

```ts
// layers/box-office/server/db/schema.ts
import { defineTable, col } from '#kit/db'
import { integer, text } from 'drizzle-orm/sqlite-core'

export const orders = defineTable('box_office_orders', {
  realm: 'audience',
  subject: 'account_id',
  retention: 'box-office.retention.orders',
}, {
  id:            col.id(),
  accountId:     col.ref('core_accounts', { nullable: true }),
  performanceId: col.ref('core_performances'),
  bookingName:   col.personal(text('booking_name').notNull()),
  email:         col.personal(text('email').notNull()),
  note:          col.freeText(text('note')),
  accessNeeds:   col.special('access_needs'),
  totalMinor:    col.minor('total_minor'),
  currency:      col.currency('currency'),
  state:         col.internal(text('state').notNull()),
  createdAt:     col.createdAt(),
})
```

The column builders are Drizzle's own; `col.*` wraps one and records its class. `defineTable` refuses a column that was not wrapped, and refuses a table name that does not start with its module's prefix.

## Classes

| Class | Helper | Examples | Default on erasure | May be changed to |
| --- | --- | --- | --- | --- |
| Public | `col.public()` | Production title, a credited name with consent | `keep` | `anonymise` |
| Internal | `col.internal()` | A state, a stock level, a total | `keep` | none |
| Personal | `col.personal()` | Email, phone, booking name | `anonymise` | `clear`, `retain` |
| Personal free text | `col.freeText()` | An incident description, a note | `redact` | `clear`, `retain` |
| Special category | `col.special()` | Access needs, health details | `clear` | none |
| Decided per row | `col.perRow()` | A form answer whose class the theatre chose per field | per row | none |

- **Special category columns are encrypted by the helper**, before the value reaches the database, with a key held as a Worker secret. They cannot be searched or indexed, and `col.special()` takes only a column name for that reason.
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
| `realm` | Yes | `audience`, `member` or `operational`. Keeps a customer's orders and a volunteer's training record apart in exports, in the privacy record and in who may see them. Proposed to workstream 2, which owns the rule |
| `subject` | Yes | How a row reaches the person it is about: a column holding an account id, `{ via: 'order_id' }` to inherit from a parent row, a list where a row concerns several people, or `'none'` |
| `retention` | No | A duration setting. A scheduled sweep erases or deletes rows older than it |
| `appendOnly` | No | Rows are never edited or deleted. The build writes the triggers that enforce it |
| `onErasure` | No, default `keep-row` | `delete-row` removes the whole row, for tables with no value once the person is gone, such as saved preferences |

- A table with `subject: 'none'` may not hold personal, free-text or special columns.
- **Append-only and erasure together:** in an append-only table, an erasable column may be changed only to its erased value, and the trigger checks that every other column is unchanged. History survives; the person does not.
- A migration that would rebuild an append-only table is refused by a check.

## Column helpers

| Helper | SQL | Holds |
| --- | --- | --- |
| `col.id()` | `text primary key` | An opaque identifier the kit generates (a ULID). No table carries another system's ids |
| `col.ref(table)` | `text references` | A foreign key. A module may reference its own tables, the core's, and those of modules in `requires` |
| `col.createdAt()`, `col.updatedAt()`, `col.timestamp(name)` | `integer` | An instant in UTC milliseconds |
| `col.localDate(name)` | `text` | A calendar date in the theatre's time zone, `YYYY-MM-DD`, for things that are dates and not instants |
| `col.minor(name)`, `col.currency(name)` | `integer`, `text` | Money in minor units, and its ISO 4217 code |
| `col.public()`, `col.internal()`, `col.personal()`, `col.freeText()`, `col.special()`, `col.perRow()` | as wrapped | Everything else |

**Columns that refer to an account**, added after draft 1 at workstream 2's request, use `col.account(name, { role, onMerge })` in place of `col.ref('core_accounts')`. The example at the top of this tab should read `accountId: col.account('account_id', { role: 'subject', onMerge: 'move', nullable: true })`.

| Option | Values | Meaning |
| --- | --- | --- |
| `role` | `subject`, `actor` | `subject`: the row is about this person, so erasure and export reach it. `actor`: the person did something to the row (approved it, sold it); the reference is kept and follows a merge |
| `onMerge` | `move`, `alias`, `handler` | What merging two accounts does: rewrite the column, leave it and let reads follow the merged account, or call the module's contribution to workstream 2's merge point |

A table's subject is inferred from its `role: 'subject'` columns. The `subject` table option remains for `{ via }` a parent row and for `'none'`. A check requires `alias` in an append-only table, because a merge cannot rewrite it.

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

**`box_office_orders`**: realm audience; subject `account_id`; retention `box-office.retention.orders`; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | ref `core_accounts` | nullable | internal | keep | Null for a guest order |
| `booking_name` | text | not null | personal | anonymise |  |
| `email` | text | not null | personal | anonymise |  |
| `note` | text |  | free text | redact |  |
| `access_needs` | text, encrypted |  | special | clear |  |
| `total_minor` | minor units | not null, at least 0 | internal | keep |  |
| `state` | text | one of a named list | internal | keep | See part 3 |

Types to use: id, ref, text, integer, boolean, timestamp, local date, minor units, currency, JSON. The table is an example of the layout, not a decision about the box office.

## Later rulings that apply to this tab

Added after this tab was written; the full list is at the end of the Formats tab. For data classes: a table's realm may differ by row (`realm: { column: 'realm' }`); a per-row class may come from a parent row (`classFrom: { via, column }`); an append-only table may have erasable columns; a table's subject may be a person with no account (`subject: { email: 'contact_email' }`, declared with `col.email`), and a subject is an account or an email, never both; account erasure and download also sweep email-subject rows for the account's verified addresses; and Nuxt Content's `_content_*` tables are outside the registry.
