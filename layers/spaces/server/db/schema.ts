// Room bookings (Spaces): seven tables (spec part 2). A core space becomes bookable only through a
// row in spaces_bookables; a van or a piano is a bookable too. Only a Confirmed booking occupies
// time, and the clash rule lives in the shape of the confirming write (server/bookings.ts), because
// SQLite cannot forbid overlapping ranges.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import { BOOKABLE_KINDS, BOOKABLE_STATES, BOOKING_EVENT_KINDS, BOOKING_STATES, CLOSED_REASONS, CONTROLS, FREQUENCIES, OPEN_TO, PURPOSE_STATES } from '../../shared/states'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** One row per thing that can be booked: a core space, or a resource of this module's own. */
export const bookables = defineTable('spaces_bookables', {
  id: col.id(),
  kind: col.internal(text('kind', { enum: BOOKABLE_KINDS }).notNull()),
  // A space's name is read from core, so a rename shows at once.
  spaceId: col.ref('core_spaces', { nullable: true }),
  name: col.internal(text('name')),
  homeVenueId: col.ref('core_venues', { nullable: true }),
  // For a space, follows core's managed flag (rule C6); chosen for a resource.
  control: col.internal(text('control', { enum: CONTROLS }).notNull()),
  approval: col.internal(text('approval', { enum: ['by-purpose', 'always'] }).notNull().default('by-purpose')),
  approvalNote: col.internal(text('approval_note')),
  externalContact: col.internal(text('external_contact')),
  alwaysOpen: col.internal(integer('always_open', { mode: 'boolean' }).notNull().default(false)),
  maxLengthMinutes: col.internal(integer('max_length_minutes')),
  guidance: col.internal(text('guidance')),
  colour: col.internal(text('colour')),
  // Requirement references as plain text, <source>:<id> or fact:<name> (rule P13).
  requirements: col.internal(text('requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  state: col.internal(text('state', { enum: BOOKABLE_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bkb',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('spaces_bookables_space').on(t.spaceId).where(sql`space_id IS NOT NULL`),
    uniqueIndex('spaces_bookables_resource_name').on(sql`lower(${t.name})`).where(sql`kind = 'resource'`),
    index('spaces_bookables_state').on(t.state, t.sort),
    check('spaces_bookables_kind', sql`${t.kind} IN (${inList(BOOKABLE_KINDS)})`),
    check('spaces_bookables_space_or_name', sql`(${t.kind} = 'space' AND ${t.spaceId} IS NOT NULL AND ${t.name} IS NULL AND ${t.homeVenueId} IS NULL) OR (${t.kind} = 'resource' AND ${t.spaceId} IS NULL AND ${t.name} IS NOT NULL)`),
    check('spaces_bookables_control', sql`${t.control} IN (${inList(CONTROLS)})`),
    check('spaces_bookables_approval', sql`${t.approval} IN ('by-purpose', 'always')`),
    check('spaces_bookables_state_values', sql`${t.state} IN (${inList(BOOKABLE_STATES)})`),
    check('spaces_bookables_name_length', sql`${t.name} IS NULL OR length(${t.name}) BETWEEN 1 AND 80`),
    check('spaces_bookables_note_length', sql`${t.approvalNote} IS NULL OR length(${t.approvalNote}) <= 500`),
    check('spaces_bookables_contact', sql`${t.externalContact} IS NULL OR (length(${t.externalContact}) <= 200 AND ${t.control} = 'external')`),
    check('spaces_bookables_max_length', sql`${t.maxLengthMinutes} IS NULL OR ${t.maxLengthMinutes} > 0`),
    check('spaces_bookables_colour', sql`${t.colour} IS NULL OR ${t.colour} IN ('calendar-1', 'calendar-2', 'calendar-3', 'calendar-4', 'calendar-5', 'calendar-6', 'calendar-7', 'calendar-8')`),
  ],
})

/** The weekly hours of a bookable, in the theatre's local time. Past midnight is a row on the next day. */
export const openingHours = defineTable('spaces_opening_hours', {
  bookableId: col.ref('spaces_bookables'),
  weekday: col.internal(integer('weekday').notNull()),
  opensAt: col.internal(text('opens_at').notNull()),
  closesAt: col.internal(text('closes_at').notNull()),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.bookableId, t.weekday, t.opensAt] }),
    check('spaces_opening_hours_weekday', sql`${t.weekday} BETWEEN 1 AND 7`),
    check('spaces_opening_hours_times', sql`${t.opensAt} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${t.closesAt} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${t.closesAt} > ${t.opensAt} AND ${t.closesAt} <= '24:00'`),
  ],
})

/** What a booking may be for, with its tier (1 is highest) and its default rules. */
export const purposes = defineTable('spaces_purposes', {
  id: col.id(),
  slug: col.internal(text('slug').notNull()),
  name: col.internal(text('name').notNull()),
  tier: col.internal(integer('tier').notNull()),
  openTo: col.internal(text('open_to', { enum: OPEN_TO }).notNull()),
  needsProduction: col.internal(integer('needs_production', { mode: 'boolean' }).notNull().default(false)),
  approval: col.internal(text('approval', { enum: ['automatic', 'approval'] }).notNull().default('automatic')),
  maxLengthMinutes: col.internal(integer('max_length_minutes')),
  maxAheadDays: col.internal(integer('max_ahead_days')),
  minNoticeMinutes: col.internal(integer('min_notice_minutes')),
  mayRepeat: col.internal(integer('may_repeat', { mode: 'boolean' }).notNull().default(true)),
  canBeBumped: col.internal(integer('can_be_bumped', { mode: 'boolean' }).notNull().default(true)),
  requirements: col.internal(text('requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  description: col.internal(text('description')),
  state: col.internal(text('state', { enum: PURPOSE_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bpu',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('spaces_purposes_slug').on(t.slug),
    uniqueIndex('spaces_purposes_name').on(sql`lower(${t.name})`),
    index('spaces_purposes_order').on(t.state, t.tier, t.sort),
    check('spaces_purposes_tier', sql`${t.tier} BETWEEN 1 AND 9`),
    check('spaces_purposes_open_to', sql`${t.openTo} IN (${inList(OPEN_TO)})`),
    // A purpose for a production's team always names the production.
    check('spaces_purposes_team_needs_production', sql`${t.openTo} != 'production-team' OR ${t.needsProduction} = 1`),
    check('spaces_purposes_approval', sql`${t.approval} IN ('automatic', 'approval')`),
    check('spaces_purposes_state_values', sql`${t.state} IN (${inList(PURPOSE_STATES)})`),
    check('spaces_purposes_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('spaces_purposes_description', sql`${t.description} IS NULL OR length(${t.description}) <= 300`),
    check('spaces_purposes_limits', sql`(${t.maxLengthMinutes} IS NULL OR ${t.maxLengthMinutes} > 0) AND (${t.maxAheadDays} IS NULL OR ${t.maxAheadDays} > 0) AND (${t.minNoticeMinutes} IS NULL OR ${t.minNoticeMinutes} >= 0)`),
  ],
})

/** Which purposes a bookable allows, with any tighter approval. No row: allowed, following the purpose. */
export const bookablePurposes = defineTable('spaces_bookable_purposes', {
  bookableId: col.ref('spaces_bookables'),
  purposeId: col.ref('spaces_purposes'),
  allowed: col.internal(integer('allowed', { mode: 'boolean' }).notNull()),
  approval: col.internal(text('approval', { enum: ['automatic', 'approval'] })),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.bookableId, t.purposeId] }),
    check('spaces_bookable_purposes_approval', sql`${t.approval} IS NULL OR ${t.approval} IN ('automatic', 'approval')`),
  ],
})

/** A repeat rule and its owner. Each occurrence is its own row in spaces_bookings, made with the series. */
export const series = defineTable('spaces_booking_series', {
  id: col.id(),
  bookableId: col.ref('spaces_bookables'),
  purposeId: col.ref('spaces_purposes'),
  bookedFor: col.account('booked_for', { role: 'subject' }),
  frequency: col.internal(text('frequency', { enum: FREQUENCIES }).notNull()),
  weekdays: col.internal(text('weekdays', { mode: 'json' }).$type<number[]>()),
  startsLocal: col.internal(text('starts_local').notNull()),
  lengthMinutes: col.internal(integer('length_minutes').notNull()),
  firstDate: col.localDate('first_date').notNull(),
  lastDate: col.localDate('last_date').notNull(),
  state: col.internal(text('state', { enum: ['active', 'ended'] }).notNull().default('active')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bks',
  realm: 'members',
  retention: 'spaces.bookings.keep-for',
  extra: t => [
    index('spaces_booking_series_for').on(t.bookedFor, t.state),
    check('spaces_booking_series_frequency', sql`${t.frequency} IN (${inList(FREQUENCIES)})`),
    check('spaces_booking_series_state', sql`${t.state} IN ('active', 'ended')`),
    check('spaces_booking_series_length', sql`${t.lengthMinutes} > 0`),
    check('spaces_booking_series_dates', sql`${t.lastDate} >= ${t.firstDate}`),
  ],
})

/** Every booking and request. */
export const bookings = defineTable('spaces_bookings', {
  id: col.id(),
  bookableId: col.ref('spaces_bookables'),
  purposeId: col.ref('spaces_purposes'),
  // Copied from the purpose when made, so a later change to a purpose never reorders what is booked.
  tier: col.internal(integer('tier').notNull()),
  seriesId: col.ref('spaces_booking_series', { nullable: true }),
  startsAt: col.timestamp('starts_at').notNull(),
  // Not included: a booking ending at 15:00 does not clash with one starting at 15:00.
  endsAt: col.timestamp('ends_at').notNull(),
  state: col.internal(text('state', { enum: BOOKING_STATES }).notNull()),
  bookedFor: col.account('booked_for', { role: 'subject' }),
  requestedBy: col.account('requested_by', { role: 'actor' }),
  productionId: col.ref('core_productions', { nullable: true }),
  // Set when another module made the booking: a record type and its id.
  originType: col.internal(text('origin_type')),
  originId: col.internal(text('origin_id')),
  title: col.freeText(text('title').notNull()),
  notes: col.freeText(text('notes')),
  attendees: col.internal(integer('attendees')),
  // Set on a change that needs a decision (rule X3).
  replacesId: col.internal(text('replaces_id')),
  bumps: col.internal(integer('bumps', { mode: 'boolean' }).notNull().default(false)),
  externalRef: col.internal(text('external_ref')),
  overrideReason: col.freeText(text('override_reason')),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  decisionNote: col.freeText(text('decision_note')),
  closedReason: col.internal(text('closed_reason', { enum: CLOSED_REASONS })),
  bumpedById: col.internal(text('bumped_by_id')),
  lateCancel: col.internal(integer('late_cancel', { mode: 'boolean' }).notNull().default(false)),
  noShow: col.internal(integer('no_show', { mode: 'boolean' }).notNull().default(false)),
  remindedAt: col.timestamp('reminded_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bkg',
  realm: 'members',
  retention: 'spaces.bookings.keep-for',
  extra: t => [
    index('spaces_bookings_clash').on(t.bookableId, t.state, t.startsAt),
    index('spaces_bookings_for').on(t.bookedFor, t.startsAt),
    index('spaces_bookings_state').on(t.state, t.startsAt),
    index('spaces_bookings_series').on(t.seriesId, t.startsAt),
    index('spaces_bookings_production').on(t.productionId, t.startsAt),
    // One live booking per record of another module (an origin).
    uniqueIndex('spaces_bookings_origin').on(t.originType, t.originId).where(sql`origin_type IS NOT NULL AND state IN ('requested', 'confirmed')`),
    check('spaces_bookings_state_values', sql`${t.state} IN (${inList(BOOKING_STATES)})`),
    check('spaces_bookings_times', sql`${t.endsAt} > ${t.startsAt}`),
    check('spaces_bookings_origin_pair', sql`(${t.originType} IS NULL) = (${t.originId} IS NULL)`),
    check('spaces_bookings_title', sql`length(${t.title}) BETWEEN 3 AND 120`),
    check('spaces_bookings_notes', sql`${t.notes} IS NULL OR length(${t.notes}) <= 1000`),
    check('spaces_bookings_attendees', sql`${t.attendees} IS NULL OR ${t.attendees} > 0`),
    check('spaces_bookings_external_ref', sql`${t.externalRef} IS NULL OR length(${t.externalRef}) <= 120`),
    check('spaces_bookings_override', sql`${t.overrideReason} IS NULL OR length(${t.overrideReason}) <= 300`),
    check('spaces_bookings_decision_note', sql`${t.decisionNote} IS NULL OR length(${t.decisionNote}) <= 500`),
    check('spaces_bookings_closed_reason', sql`${t.closedReason} IS NULL OR ${t.closedReason} IN (${inList(CLOSED_REASONS)})`),
    // A no-show is marked only on a completed booking.
    check('spaces_bookings_no_show', sql`${t.noShow} = 0 OR ${t.state} = 'completed'`),
  ],
})

/** What happened to each booking, in order. The booking's own history, not the audit log. */
export const bookingEvents = defineTable('spaces_booking_events', {
  id: col.id(),
  bookingId: col.ref('spaces_bookings'),
  kind: col.internal(text('kind', { enum: BOOKING_EVENT_KINDS }).notNull()),
  actor: col.account('actor', { role: 'actor', nullable: true }),
  at: col.timestamp('at').notNull(),
  // Ids, times and reason codes only, never text a person typed.
  detail: col.internal(text('detail', { mode: 'json' }).$type<Record<string, unknown>>()),
  note: col.freeText(text('note')),
}, {
  id: 'bke',
  realm: 'members',
  subject: { via: 'booking_id' },
  appendOnly: true,
  retention: 'spaces.bookings.keep-for',
  extra: t => [
    index('spaces_booking_events_booking').on(t.bookingId, t.at),
    check('spaces_booking_events_kind', sql`${t.kind} IN (${inList(BOOKING_EVENT_KINDS)})`),
    check('spaces_booking_events_note', sql`${t.note} IS NULL OR length(${t.note}) <= 500`),
  ],
})

export const tables = { bookables, openingHours, purposes, bookablePurposes, series, bookings, bookingEvents }
