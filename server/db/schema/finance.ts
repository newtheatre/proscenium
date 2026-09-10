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
