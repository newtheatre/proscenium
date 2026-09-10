import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The daily reconciliation record (I-104), a fact to explain rather than an error to suppress:
// a correction or a write-off is a new row naming the one it resolves, never an edit.

export const zReadings = sqliteTable('z_readings', {
  id: id(),
  // The show night (04:00 to 04:00 London, 0014), the same label till_sessions.night carries:
  // the reader is read once a night, not once a calendar day (F-118, architecture.md).
  night: text('night').notNull(),
  readerPence: integer('reader_pence').notNull(),
  // Snapshotted at entry: what "expected" meant at the moment somebody compared it to the reader,
  // never recomputed later even if the ledger gains a late-dated correction for that night.
  expectedPence: integer('expected_pence').notNull(),
  variancePence: integer('variance_pence').notNull(),
  enteredBy: text('entered_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  note: text('note'),
  // The reading this one resolves, correcting or writing off; no foreign key, the same reasoning
  // as every other append-only self-reference (ledger.ts): both rows stay (criterion 4).
  supersedesId: text('supersedes_id'),
  writtenOff: integer('written_off', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('z_readings_night').on(table.night),
  // A racing second first-reading for the same night, and a racing second resolution of the same
  // open reading, both collide on these rather than forking the chain silently (0001, 0003, 0006).
  uniqueIndex('z_readings_one_root_per_night').on(table.night).where(sql`${table.supersedesId} IS NULL`),
  uniqueIndex('z_readings_supersedes_once').on(table.supersedesId).where(sql`${table.supersedesId} IS NOT NULL`),
  check('z_readings_variance_is_the_difference', sql`${table.variancePence} = ${table.readerPence} - ${table.expectedPence}`),
  // Criterion 3: a variance needs a note before it can be recorded at all.
  check('z_readings_variance_has_a_note', sql`${table.variancePence} = 0 OR ${table.note} IS NOT NULL`),
  // A write-off accepts a real, nonzero difference rather than restating it as zero, and always
  // names what it resolves (criterion 4): nothing is written off that nothing else named first.
  check('z_readings_write_off_resolves_a_variance', sql`${table.writtenOff} = 0 OR (${table.variancePence} <> 0 AND ${table.supersedesId} IS NOT NULL)`),
])

// A named term (I-107, I-105's own dashboard selector). A season needs no row: its range is
// computed from `committeeYearEnd` and stored nowhere (architecture.md, E-126).

export const periods = sqliteTable('periods', {
  id: id(),
  label: text('label').notNull(),
  fromDay: text('from_day').notNull(),
  toDay: text('to_day').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('periods_range').on(table.fromDay, table.toDay),
  check('periods_range_order', sql`${table.toDay} >= ${table.fromDay}`),
])

// A period close (I-107): a fact appended, never a flag flipped on the entries it covers.
// `ledger_entries_refuses_a_closed_period` is what actually stops a write; this is the record.

export const periodLocks = sqliteTable('period_locks', {
  id: id(),
  // Both inclusive, `london_day` format: what a period covers is a calendar range, the same
  // grouping every month and season total already uses, never the show night (architecture.md).
  fromDay: text('from_day').notNull(),
  toDay: text('to_day').notNull(),
  label: text('label'),
  action: text('action').notNull(),
  actorId: text('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  // Locked status for a day is read off the latest row covering it; unbounded by range count
  // rather than by row count, since a season's history is a handful of closes, not a scan (0001).
  index('period_locks_range').on(table.fromDay, table.toDay, table.createdAt),
  check('period_locks_action', sql`${table.action} IN ('CLOSED', 'REOPENED')`),
  check('period_locks_range_order', sql`${table.toDay} >= ${table.fromDay}`),
])

// SU nominal code mappings (I-108): one row per (kind, source) pair the ledger can post under
// (architecture.md), seeded by migration and only ever UPDATEd, like `incident_severity_config`.

export const suNominalMappings = sqliteTable('su_nominal_mappings', {
  id: id(),
  kind: text('kind').notNull(),
  source: text('source').notNull(),
  nominalCode: text('nominal_code'),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  uniqueIndex('su_nominal_mappings_kind_source').on(table.kind, table.source),
])
