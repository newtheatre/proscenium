// Front of house: who works each night and on what (Front of house specification, part 2). A
// reference to a performance or a venue is by id only: no table here reads the core's. The shift
// window is stored on the shift, so "is this person on shift?" is one indexed read, and the CHECK on
// places_taken is what stops a place being taken twice.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** States in which an assignment holds a place. */
export const LIVE_STATES = ['requested', 'confirmed', 'release_requested', 'checked_in'] as const
/** States in which an assignment gives the on-shift fact. */
export const AUTHORITY_STATES = ['confirmed', 'release_requested', 'checked_in'] as const
export const ASSIGNMENT_STATES = [...LIVE_STATES, 'worked', 'no_show', 'declined', 'withdrawn', 'released', 'removed'] as const

const list = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** A kind of job on a night: duty manager, steward, bar. Never called a role. */
export const duties = defineTable('front_of_house_duties', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  // Holding it confers front-of-house.leading-shift.
  isLead: col.internal(integer('is_lead', { mode: 'boolean' }).notNull().default(false)),
  callBeforeMinutes: col.internal(integer('call_before_minutes').notNull()),
  stayAfterMinutes: col.internal(integer('stay_after_minutes').notNull()),
  // A JSON list of requirement references, checked through the kit. Front of house never reads inside one.
  requirements: col.internal(text('requirements').notNull().default('[]')),
  sortOrder: col.internal(integer('sort_order').notNull().default(0)),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'dty',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_duties_name').on(t.name).where(sql`archived_at IS NULL`),
    check('front_of_house_duties_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('front_of_house_duties_description', sql`${t.description} IS NULL OR length(${t.description}) <= 500`),
    check('front_of_house_duties_call', sql`${t.callBeforeMinutes} BETWEEN 0 AND 480`),
    check('front_of_house_duties_stay', sql`${t.stayAfterMinutes} BETWEEN 0 AND 480`),
  ],
})

/** A named set of duties and place counts, applied to a performance to make its shifts. */
export const rotaTemplates = defineTable('front_of_house_rota_templates', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  // Offered first for performances in this venue.
  venueId: col.internal(text('venue_id')),
  isDefault: col.internal(integer('is_default', { mode: 'boolean' }).notNull().default(false)),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'rtp',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_rota_templates_name').on(t.name).where(sql`archived_at IS NULL`),
    // At most one default per venue, and one with no venue.
    uniqueIndex('front_of_house_rota_templates_default').on(sql`coalesce(${t.venueId}, '')`).where(sql`is_default = 1 AND archived_at IS NULL`),
    check('front_of_house_rota_templates_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
  ],
})

/** One duty in a rota template. */
export const rotaTemplateLines = defineTable('front_of_house_rota_template_lines', {
  templateId: col.ref('front_of_house_rota_templates'),
  dutyId: col.ref('front_of_house_duties'),
  places: col.internal(integer('places').notNull()),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.templateId, t.dutyId] }),
    check('front_of_house_rota_template_lines_places', sql`${t.places} BETWEEN 1 AND 50`),
  ],
})

/** One duty at one performance, or at another occasion when performance_id is null. */
export const shifts = defineTable('front_of_house_shifts', {
  id: col.id(),
  performanceId: col.internal(text('performance_id')),
  venueId: col.internal(text('venue_id')),
  title: col.internal(text('title')),
  dutyId: col.ref('front_of_house_duties'),
  places: col.internal(integer('places').notNull()),
  // Kept in the same batch as each assignment change. The CHECK is what stops a place being taken twice.
  placesTaken: col.internal(integer('places_taken').notNull().default(0)),
  callAt: col.timestamp('call_at').notNull(),
  endsAt: col.timestamp('ends_at').notNull(),
  windowOpensAt: col.timestamp('window_opens_at').notNull(),
  windowClosesAt: col.timestamp('window_closes_at').notNull(),
  // Null means sign-up is not offered: a manager fills the shift.
  signUpClosesAt: col.timestamp('sign_up_closes_at'),
  briefing: col.internal(text('briefing')),
  state: col.internal(text('state', { enum: ['draft', 'published', 'completed', 'cancelled'] }).notNull().default('draft')),
  cancelledReason: col.internal(text('cancelled_reason')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'shf',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_shifts_duty').on(t.performanceId, t.dutyId).where(sql`performance_id IS NOT NULL`),
    index('front_of_house_shifts_window').on(t.state, t.windowClosesAt),
    check('front_of_house_shifts_title', sql`(${t.performanceId} IS NOT NULL OR ${t.title} IS NOT NULL) AND (${t.title} IS NULL OR length(${t.title}) <= 80)`),
    check('front_of_house_shifts_places', sql`${t.places} BETWEEN 1 AND 50 AND ${t.placesTaken} BETWEEN 0 AND ${t.places}`),
    check('front_of_house_shifts_times', sql`${t.endsAt} > ${t.callAt} AND ${t.windowOpensAt} <= ${t.callAt} AND ${t.windowClosesAt} >= ${t.endsAt}`),
    check('front_of_house_shifts_briefing', sql`${t.briefing} IS NULL OR length(${t.briefing}) <= 1000`),
    check('front_of_house_shifts_state', sql`${t.state} IN ('draft', 'published', 'completed', 'cancelled')`),
    check('front_of_house_shifts_reason', sql`${t.cancelledReason} IS NULL OR length(${t.cancelledReason}) <= 200`),
  ],
})

/** One person on one shift. "Shift" is the job; "assignment" is a person doing it. */
export const assignments = defineTable('front_of_house_assignments', {
  id: col.id(),
  shiftId: col.ref('front_of_house_shifts'),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'One live assignment per account per shift is a unique rule on the stored id' }),
  state: col.internal(text('state', { enum: ASSIGNMENT_STATES }).notNull()),
  source: col.internal(text('source', { enum: ['sign-up', 'assigned', 'cover'] }).notNull()),
  assignedBy: col.account('assigned_by', { role: 'actor', nullable: true }),
  confirmedAt: col.timestamp('confirmed_at'),
  checkedInAt: col.timestamp('checked_in_at'),
  checkedOutAt: col.timestamp('checked_out_at'),
  endedAt: col.timestamp('ended_at'),
  endedBy: col.account('ended_by', { role: 'actor', nullable: true }),
  // The person's own words.
  releaseReason: col.freeText(text('release_reason')),
  minutesWorked: col.internal(integer('minutes_worked')),
  reminded: col.internal(integer('reminded').notNull().default(0)),
  // The merge that released this assignment because both accounts were on the shift (part 3).
  freedByMerge: col.internal(text('freed_by_merge')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'asg',
  realm: 'members',
  subject: 'account_id',
  extra: t => [
    uniqueIndex('front_of_house_assignments_live').on(t.shiftId, t.accountId).where(sql`state IN (${list(LIVE_STATES)})`),
    index('front_of_house_assignments_account').on(t.accountId, t.state),
    check('front_of_house_assignments_state', sql`${t.state} IN (${list(ASSIGNMENT_STATES)})`),
    check('front_of_house_assignments_source', sql`${t.source} IN ('sign-up', 'assigned', 'cover')`),
    check('front_of_house_assignments_reason', sql`${t.releaseReason} IS NULL OR length(${t.releaseReason}) <= 300`),
    check('front_of_house_assignments_minutes', sql`${t.minutesWorked} IS NULL OR ${t.minutesWorked} >= 0`),
  ],
})

export const tables = { duties, rotaTemplates, rotaTemplateLines, shifts, assignments }
