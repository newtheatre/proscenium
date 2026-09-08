import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { performances, venues } from './programme'
import { users } from './identity'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

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
  // Set on a decline; the claimant is shown it, the audit trail is not (E-105 criterion 3, 0011).
  declineReason: text('decline_reason'),
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

// Consent, not a fact about the person: whether their phone shows on tonight's team list. A new
// table rather than a `users` column, which build-order.md fixes against new NOT NULL additions.
export const shiftContactPreferences = sqliteTable('shift_contact_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull().default(now),
})

// The incident log (E-115), append-only. A near miss is one of `severity`'s own values, never a
// second table: E-117 criterion 3's "distinct type" is this column, not a new one.
export const incidents = sqliteTable('incidents', {
  id: id(),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),
  reportedBy: text('reported_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  category: text('category').notNull(),
  severity: text('severity').notNull(),
  // Operational free text: people by role, never a diagnosis (docs/data-model.md).
  body: text('body').notNull(),
  // Defaults to now; backdatable within tonight only, checked at the write path against the
  // show-night boundary rather than a static CHECK (E-115 criterion 1).
  happenedAt: integer('happened_at').notNull().default(now),
  supersedesId: text('supersedes_id').references((): AnySQLiteColumn => incidents.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('incidents_performance').on(table.performanceId),
  index('incidents_reported_by').on(table.reportedBy),
  index('incidents_created_at').on(table.createdAt),
  // One correction per entry: a second would leave the chain ambiguous (E-115 criterion 3).
  uniqueIndex('incidents_one_correction').on(table.supersedesId),
  check('incidents_category_values', sql`${table.category} IN ('MEDICAL', 'BEHAVIOUR', 'SAFETY', 'SECURITY', 'PROPERTY', 'OTHER')`),
  check('incidents_severity_values', sql`${table.severity} IN ('NOTE', 'NEAR_MISS', 'INCIDENT', 'SERIOUS')`),
  check('incidents_no_self_supersede', sql`${table.supersedesId} IS NULL OR ${table.supersedesId} <> ${table.id}`),
])

// The Challenge 25 register (E-118), licensing evidence and append-only like `incidents`.
// `performance_id` is nullable because bar checks age outside a show as well as inside one.
export const ageChecks = sqliteTable('age_checks', {
  id: id(),
  performanceId: text('performance_id').references(() => performances.id, { onDelete: 'restrict' }),
  checkedBy: text('checked_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  outcome: text('outcome').notNull(),
  // Which side of the outcome is populated, never both: what ID was accepted, or why refused.
  idType: text('id_type'),
  reason: text('reason'),
  // Appearance, never a name; the form's own guidance is what actually keeps a name out.
  description: text('description').notNull(),
  product: text('product'),
  notes: text('notes'),
  supersedesId: text('supersedes_id').references((): AnySQLiteColumn => ageChecks.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('age_checks_performance').on(table.performanceId),
  index('age_checks_checked_by').on(table.checkedBy),
  index('age_checks_created_at').on(table.createdAt),
  // One correction per entry: a second one would leave the chain ambiguous about which
  // correction is current (E-118 criterion 3).
  uniqueIndex('age_checks_one_correction').on(table.supersedesId),
  check('age_checks_outcome_values', sql`${table.outcome} IN ('ACCEPTED', 'REFUSED')`),
  check('age_checks_id_type_values', sql`${table.idType} IS NULL OR ${table.idType} IN ('PASSPORT', 'DRIVING_LICENCE', 'PASS_CARD', 'OTHER')`),
  check('age_checks_reason_values', sql`${table.reason} IS NULL OR ${table.reason} IN ('NO_ID_SHOWN', 'ID_LOOKED_FALSE', 'APPEARED_UNDERAGE', 'OTHER')`),
  // Exactly one side of the outcome carries data: accepted names the ID, refused names why,
  // and neither ever carries both (E-118 criterion 1).
  check('age_checks_outcome_shape', sql`
    (${table.outcome} = 'ACCEPTED' AND ${table.idType} IS NOT NULL AND ${table.reason} IS NULL)
    OR (${table.outcome} = 'REFUSED' AND ${table.reason} IS NOT NULL AND ${table.idType} IS NULL)
  `),
  check('age_checks_no_self_supersede', sql`${table.supersedesId} IS NULL OR ${table.supersedesId} <> ${table.id}`),
])

// The pre and post-show checklist's committee configuration (E-114). Keyed to a venue, not a
// performance: like `till_sessions`, one night at a venue may cover more than one performance.
export const checklistItems = sqliteTable('checklist_items', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  phase: text('phase').notNull(),
  label: text('label').notNull(),
  sort: integer('sort').notNull().default(0),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
  // A live check the item ticks itself from; NULL means a person ticks it by hand (criterion 3).
  systemCheck: text('system_check'),
  // Soft-retired, never deleted: a stamp already made keeps referencing it (criterion 1).
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('checklist_items_venue').on(table.venueId),
  check('checklist_items_phase_values', sql`${table.phase} IN ('PRE', 'POST')`),
  check('checklist_items_system_check_values', sql`${table.systemCheck} IS NULL OR ${table.systemCheck} IN ('NO_SHOW_HOLDS_RELEASED', 'INCIDENTS_REVIEWED')`),
])

// A snapshot of an item at the moment it is stamped onto a venue's night: editing
// `checklist_items` afterwards changes nothing already stamped (E-101's pattern, criterion 1).
export const checklistStamps = sqliteTable('checklist_stamps', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  night: text('night').notNull(),
  itemId: text('item_id').notNull().references(() => checklistItems.id, { onDelete: 'restrict' }),
  phase: text('phase').notNull(),
  label: text('label').notNull(),
  sort: integer('sort').notNull(),
  required: integer('required', { mode: 'boolean' }).notNull(),
  systemCheck: text('system_check'),
  tickedBy: text('ticked_by').references(() => users.id, { onDelete: 'restrict' }),
  tickedAt: integer('ticked_at'),
  exempted: integer('exempted', { mode: 'boolean' }).notNull().default(false),
  exemptReason: text('exempt_reason'),
  exemptedBy: text('exempted_by').references(() => users.id, { onDelete: 'restrict' }),
  exemptedAt: integer('exempted_at'),
  stampedAt: integer('stamped_at').notNull().default(now),
}, table => [
  // One stamp per item per venue per night: stamping is idempotent (E-102's own pattern).
  unique('checklist_stamps_venue_night_item').on(table.venueId, table.night, table.itemId),
  index('checklist_stamps_venue_night').on(table.venueId, table.night),
  check('checklist_stamps_phase_values', sql`${table.phase} IN ('PRE', 'POST')`),
  check('checklist_stamps_ticked_shape', sql`
    (${table.tickedBy} IS NULL AND ${table.tickedAt} IS NULL) OR (${table.tickedBy} IS NOT NULL AND ${table.tickedAt} IS NOT NULL)
  `),
  check('checklist_stamps_exempt_shape', sql`
    (${table.exempted} = 0 AND ${table.exemptReason} IS NULL AND ${table.exemptedBy} IS NULL AND ${table.exemptedAt} IS NULL)
    OR (${table.exempted} = 1 AND ${table.exemptReason} IS NOT NULL AND ${table.exemptedBy} IS NOT NULL AND ${table.exemptedAt} IS NOT NULL)
  `),
  check('checklist_stamps_not_ticked_and_exempted', sql`NOT (${table.tickedAt} IS NOT NULL AND ${table.exempted} = 1)`),
  // A system-verified item ticks itself from live data, never from a person (criterion 3).
  check('checklist_stamps_system_never_hand_ticked', sql`${table.systemCheck} IS NULL OR ${table.tickedBy} IS NULL`),
])

// The close-night action itself (criterion 4): one row per venue per night, written once.
export const checklistCloses = sqliteTable('checklist_closes', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  night: text('night').notNull(),
  closedBy: text('closed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  closedAt: integer('closed_at').notNull().default(now),
}, table => [
  unique('checklist_closes_venue_night').on(table.venueId, table.night),
])
