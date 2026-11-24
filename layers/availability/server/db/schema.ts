// Availability: a person's own word on when they are free (spec part 2). The gate's six tables:
// profiles, weekly patterns and their lines, dated exceptions, and requests with the people asked.
// Polls add a find, its people, slots and votes; meetings and calendar imports add theirs later. Times of day are wall clock.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import { ASKED_STATES, LEVELS, POLL_STATES, REQUEST_STATES, UNMARKED, VOTES } from '../../shared/levels'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))
const clock = (c: unknown) => sql`(${c} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${c} <= '24:00')`

/** One row per account that has entered anything: what unmarked time means, and when it last changed. */
export const profiles = defineTable('availability_profiles', {
  accountId: col.account('account_id', { role: 'subject' }),
  unmarkedMeans: col.internal(text('unmarked_means', { enum: UNMARKED })),
  changedAt: col.timestamp('changed_at').notNull(),
  checkedTo: col.localDate('checked_to'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.accountId] }),
    check('availability_profiles_unmarked', sql`${t.unmarkedMeans} IS NULL OR ${t.unmarkedMeans} IN (${inList(UNMARKED)})`),
  ],
})

/** A named weekly pattern with a date range. Two of one person never share a date (rule A2). */
export const patterns = defineTable('availability_patterns', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  label: col.freeText(text('label').notNull()),
  startsOn: col.localDate('starts_on').notNull(),
  endsOn: col.localDate('ends_on'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avpt',
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    index('availability_patterns_account').on(t.accountId, t.startsOn),
    check('availability_patterns_label', sql`length(${t.label}) BETWEEN 1 AND 40`),
    check('availability_patterns_dates', sql`${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`),
  ],
})

/** One weekly time in a pattern. Lines of one pattern and weekday never overlap (rule A2). */
export const patternLines = defineTable('availability_pattern_lines', {
  id: col.id(),
  patternId: col.ref('availability_patterns'),
  weekday: col.internal(integer('weekday').notNull()),
  fromLocal: col.internal(text('from_local').notNull()),
  untilLocal: col.internal(text('until_local').notNull()),
  level: col.internal(text('level', { enum: LEVELS }).notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avpl',
  realm: 'members',
  subject: { via: 'pattern_id' },
  onErasure: 'delete-row',
  extra: t => [
    index('availability_pattern_lines_pattern').on(t.patternId, t.weekday, t.fromLocal),
    check('availability_pattern_lines_weekday', sql`${t.weekday} BETWEEN 1 AND 7`),
    check('availability_pattern_lines_times', sql`${clock(t.fromLocal)} AND ${clock(t.untilLocal)} AND ${t.untilLocal} > ${t.fromLocal}`),
    check('availability_pattern_lines_level', sql`${t.level} IN (${inList(LEVELS)})`),
  ],
})

/** A dated entry: whole days or a time on each, optionally only some weekdays. The latest entered wins. */
export const exceptions = defineTable('availability_exceptions', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  firstDate: col.localDate('first_date').notNull(),
  lastDate: col.localDate('last_date').notNull(),
  weekdays: col.internal(text('weekdays', { mode: 'json' }).$type<number[]>()),
  fromLocal: col.internal(text('from_local')),
  untilLocal: col.internal(text('until_local')),
  level: col.internal(text('level', { enum: LEVELS }).notNull()),
  reason: col.freeText(text('reason')),
  reasonShared: col.internal(integer('reason_shared', { mode: 'boolean' }).notNull().default(false)),
  // Differs from account_id for an entry made on the person's behalf (rule A8).
  enteredBy: col.account('entered_by', { role: 'actor' }),
  requestId: col.ref('availability_requests', { nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avex',
  realm: 'members',
  retention: 'availability.retention.past',
  onErasure: 'delete-row',
  extra: t => [
    index('availability_exceptions_account').on(t.accountId, t.lastDate),
    check('availability_exceptions_dates', sql`${t.lastDate} >= ${t.firstDate} AND julianday(${t.lastDate}) - julianday(${t.firstDate}) <= 366`),
    check('availability_exceptions_times', sql`(${t.fromLocal} IS NULL AND ${t.untilLocal} IS NULL) OR (${clock(t.fromLocal)} AND ${clock(t.untilLocal)} AND ${t.untilLocal} > ${t.fromLocal})`),
    check('availability_exceptions_level', sql`${t.level} IN (${inList(LEVELS)})`),
    check('availability_exceptions_reason', sql`${t.reason} IS NULL OR length(${t.reason}) <= 300`),
  ],
})

/** A request for people to check their availability over a period (rules R1 to R7). */
export const requests = defineTable('availability_requests', {
  id: col.id(),
  title: col.internal(text('title').notNull()),
  // The organiser's words; the screen says not to name anyone in them.
  message: col.internal(text('message')),
  fromDate: col.localDate('from_date').notNull(),
  toDate: col.localDate('to_date').notNull(),
  dueOn: col.localDate('due_on').notNull(),
  groupRefs: col.internal(text('group_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  // People named beside the groups, so the daily task never withdraws them as leavers (R6).
  accountRefs: col.internal(text('account_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  sourceRef: col.internal(text('source_ref')),
  openedBy: col.account('opened_by', { role: 'actor' }),
  state: col.internal(text('state', { enum: REQUEST_STATES }).notNull().default('open')),
  // "Remind now" goes at most once a day (S11).
  remindedAt: col.timestamp('reminded_at'),
  closedAt: col.timestamp('closed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avrq',
  realm: 'members',
  subject: 'none',
  retention: 'availability.retention.history',
  extra: t => [
    uniqueIndex('availability_requests_source').on(t.sourceRef).where(sql`source_ref IS NOT NULL AND state = 'open'`),
    index('availability_requests_state').on(t.state, t.dueOn),
    check('availability_requests_title', sql`length(${t.title}) BETWEEN 1 AND 80`),
    check('availability_requests_message', sql`${t.message} IS NULL OR length(${t.message}) <= 1000`),
    check('availability_requests_dates', sql`${t.toDate} >= ${t.fromDate} AND julianday(${t.toDate}) - julianday(${t.fromDate}) <= 366`),
    check('availability_requests_state_values', sql`${t.state} IN (${inList(REQUEST_STATES)})`),
  ],
})

/** One person asked by a request, and how far they have got. */
export const requestPeople = defineTable('availability_request_people', {
  id: col.id(),
  requestId: col.ref('availability_requests'),
  accountId: col.account('account_id', { role: 'subject' }),
  state: col.internal(text('state', { enum: ASKED_STATES }).notNull().default('asked')),
  answeredAt: col.timestamp('answered_at'),
  remindersSent: col.internal(integer('reminders_sent').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avrp',
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    uniqueIndex('availability_request_people_once').on(t.requestId, t.accountId),
    index('availability_request_people_account').on(t.accountId, t.state),
    check('availability_request_people_state', sql`${t.state} IN (${inList(ASKED_STATES)})`),
  ],
})

/** A find sent as a poll (F7, F8): 2 to 6 slots its people answer until `answers_by`. */
export const finds = defineTable('availability_finds', {
  id: col.id(),
  title: col.internal(text('title').notNull()),
  lengthMinutes: col.internal(integer('length_minutes').notNull()),
  groupRefs: col.internal(text('group_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  spaceIds: col.internal(text('space_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  contextRef: col.internal(text('context_ref')),
  targetId: col.internal(text('target_id')),
  createdBy: col.account('created_by', { role: 'actor' }),
  answersBy: col.timestamp('answers_by').notNull(),
  state: col.internal(text('state', { enum: POLL_STATES }).notNull().default('polling')),
  decidedSlotId: col.internal(text('decided_slot_id')),
  outcomeRef: col.internal(text('outcome_ref')),
  decidedAt: col.timestamp('decided_at'),
  abandonedAt: col.timestamp('abandoned_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avfd',
  realm: 'members',
  subject: 'none',
  retention: 'availability.retention.history',
  extra: t => [
    index('availability_finds_state').on(t.state, t.answersBy),
    index('availability_finds_created_by').on(t.createdBy),
    check('availability_finds_title', sql`length(${t.title}) BETWEEN 1 AND 80`),
    check('availability_finds_length', sql`${t.lengthMinutes} BETWEEN 15 AND 720`),
    check('availability_finds_state_values', sql`${t.state} IN (${inList(POLL_STATES)})`),
  ],
})

/** One person a poll asks; must-have people rule out slots on the grid. */
export const findPeople = defineTable('availability_find_people', {
  findId: col.ref('availability_finds'),
  accountId: col.account('account_id', { role: 'subject' }),
  mustHave: col.internal(integer('must_have', { mode: 'boolean' }).notNull().default(false)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.findId, t.accountId] }),
    index('availability_find_people_account').on(t.accountId),
  ],
})

/** A shortlisted slot of a poll, its length the find's. */
export const findSlots = defineTable('availability_find_slots', {
  id: col.id(),
  findId: col.ref('availability_finds'),
  startsAt: col.timestamp('starts_at').notNull(),
  endsAt: col.timestamp('ends_at').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avfs',
  realm: 'members',
  subject: 'none',
  extra: t => [
    uniqueIndex('availability_find_slots_once').on(t.findId, t.startsAt),
    check('availability_find_slots_order', sql`${t.endsAt} > ${t.startsAt}`),
  ],
})

/** One person's answer for one slot. Only they and the organiser ever see it (F7). */
export const findVotes = defineTable('availability_find_votes', {
  id: col.id(),
  slotId: col.ref('availability_find_slots'),
  accountId: col.account('account_id', { role: 'subject' }),
  answer: col.internal(text('answer', { enum: VOTES }).notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'avfv',
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    uniqueIndex('availability_find_votes_once').on(t.slotId, t.accountId),
    index('availability_find_votes_account').on(t.accountId),
    check('availability_find_votes_answer', sql`${t.answer} IN (${inList(VOTES)})`),
  ],
})

export const tables = { profiles, patterns, patternLines, exceptions, requests, requestPeople, finds, findPeople, findSlots, findVotes }
