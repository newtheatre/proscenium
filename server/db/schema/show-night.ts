import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { performances, venues } from './programme'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The rota (E-101, E-102, E-106). A shift belongs to exactly one performance, never to a day or
// a venue, so two performances on one day are two rotas (E-127 criterion 1).

// A venue's template: one row per role, and the count is how many of that role the house needs.
// A venue with no rows has no template and stamps nothing (E-101 criteria 1 and 4).
export const shiftTemplates = sqliteTable('shift_templates', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  count: integer('count').notNull(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('shift_templates_venue_role').on(table.venueId, table.role),
  check('shift_templates_role_values', sql`${table.role} IN ('DUTY_MANAGER', 'DOOR', 'BAR')`),
  check('shift_templates_count_positive', sql`${table.count} > 0`),
  // One duty manager, never two. That the slot exists at all correlates rows, so the write path
  // is what refuses a template without one (E-101 criterion 1).
  check('shift_templates_one_duty_manager', sql`${table.role} <> 'DUTY_MANAGER' OR ${table.count} = 1`),
])

// A stamped slot. `slot` is the ordinal within its role on this performance, counting from one,
// and the uniqueness over the three is what makes a backfill idempotent (E-102 criterion 2).
export const shifts = sqliteTable('shifts', {
  id: id(),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  slot: integer('slot').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('OPEN'),
  // The training gate could not be evaluated, so somebody has to look (E-103 criterion 4).
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  claimedAt: integer('claimed_at'),
  confirmedAt: integer('confirmed_at'),
  // Describes the slot, never the person in it.
  notes: text('notes'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('shifts_performance_slot').on(table.performanceId, table.role, table.slot),
  index('shifts_performance').on(table.performanceId),
  index('shifts_user').on(table.userId),
  index('shifts_status').on(table.status),
  check('shifts_role_values', sql`${table.role} IN ('DUTY_MANAGER', 'DOOR', 'BAR')`),
  check('shifts_status_values', sql`${table.status} IN ('OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED', 'CANCELLED')`),
  check('shifts_slot_positive', sql`${table.slot} >= 1`),
  // An open shift names nobody and an assigned one names somebody. A cancelled shift says
  // nothing either way: it keeps whoever held it, and held nobody when it was open (E-106).
  check('shifts_open_names_nobody', sql`
    (${table.status} = 'OPEN' AND ${table.userId} IS NULL)
    OR (${table.status} IN ('CLAIMED', 'CONFIRMED', 'DECLINED') AND ${table.userId} IS NOT NULL)
    OR ${table.status} = 'CANCELLED'
  `),
  // Per performance, so two performances running at once need two duty managers, and a second
  // confirmation fails at the write whatever code path attempts it (E-106 criterion 1).
  uniqueIndex('shifts_one_confirmed_duty_manager').on(table.performanceId)
    .where(sql`role = 'DUTY_MANAGER' AND status = 'CONFIRMED'`),
])
