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

export const TIMING_KINDS = ['house_open', 'curtain_up', 'interval_start', 'interval_end', 'curtain_down', 'house_clear'] as const

/** A recorded moment of the night: house open, curtain up and the rest. One of each per performance. */
export const timings = defineTable('front_of_house_timings', {
  id: col.id(),
  performanceId: col.internal(text('performance_id').notNull()),
  kind: col.internal(text('kind', { enum: TIMING_KINDS }).notNull()),
  at: col.timestamp('at').notNull(),
  recordedBy: col.account('recorded_by', { role: 'actor' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tmg',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_timings_kind').on(t.performanceId, t.kind),
    check('front_of_house_timings_kind_check', sql`${t.kind} IN (${list(TIMING_KINDS)})`),
  ],
})

/** A checklist for a moment of the night: before the house opens, after it clears. */
export const checklists = defineTable('front_of_house_checklists', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  moment: col.internal(text('moment', { enum: ['pre-show', 'post-show', 'other'] }).notNull()),
  // Null applies everywhere.
  venueId: col.internal(text('venue_id')),
  // Whose list it usually is: a hint for the board, not a restriction.
  dutyId: col.ref('front_of_house_duties', { nullable: true }),
  sortOrder: col.internal(integer('sort_order').notNull().default(0)),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ckl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    check('front_of_house_checklists_name', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('front_of_house_checklists_moment', sql`${t.moment} IN ('pre-show', 'post-show', 'other')`),
  ],
})

/** One item of a checklist. Archived, never deleted, once a run has used it. */
export const checklistItems = defineTable('front_of_house_checklist_items', {
  id: col.id(),
  checklistId: col.ref('front_of_house_checklists'),
  label: col.internal(text('label').notNull()),
  help: col.internal(text('help')),
  kind: col.internal(text('kind', { enum: ['tick', 'reading'] }).notNull().default('tick')),
  unit: col.internal(text('unit')),
  required: col.internal(integer('required', { mode: 'boolean' }).notNull().default(true)),
  sortOrder: col.internal(integer('sort_order').notNull().default(0)),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cki',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('front_of_house_checklist_items_list').on(t.checklistId, t.sortOrder),
    check('front_of_house_checklist_items_label', sql`length(${t.label}) BETWEEN 1 AND 160`),
    check('front_of_house_checklist_items_help', sql`${t.help} IS NULL OR length(${t.help}) <= 500`),
    check('front_of_house_checklist_items_kind', sql`${t.kind} IN ('tick', 'reading')`),
    check('front_of_house_checklist_items_unit', sql`${t.unit} IS NULL OR (${t.kind} = 'reading' AND length(${t.unit}) <= 20)`),
  ],
})

/** One use of a checklist on one night. */
export const checklistRuns = defineTable('front_of_house_checklist_runs', {
  id: col.id(),
  checklistId: col.ref('front_of_house_checklists'),
  performanceId: col.internal(text('performance_id')),
  venueId: col.internal(text('venue_id')),
  localDate: col.localDate('local_date').notNull(),
  state: col.internal(text('state', { enum: ['open', 'complete', 'complete_with_exceptions'] }).notNull().default('open')),
  completedBy: col.account('completed_by', { role: 'actor', nullable: true }),
  completedAt: col.timestamp('completed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ckr',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_checklist_runs_performance').on(t.checklistId, t.performanceId).where(sql`performance_id IS NOT NULL`),
    uniqueIndex('front_of_house_checklist_runs_day').on(t.checklistId, sql`coalesce(${t.venueId}, '')`, t.localDate).where(sql`performance_id IS NULL`),
    check('front_of_house_checklist_runs_state', sql`${t.state} IN ('open', 'complete', 'complete_with_exceptions')`),
  ],
})

/** The outcome of one item in one run. The label is copied, so a later rewording leaves the record alone. */
export const checklistEntries = defineTable('front_of_house_checklist_entries', {
  id: col.id(),
  runId: col.ref('front_of_house_checklist_runs'),
  itemId: col.ref('front_of_house_checklist_items'),
  label: col.internal(text('label').notNull()),
  outcome: col.internal(text('outcome', { enum: ['done', 'exception', 'not_applicable'] }).notNull()),
  reading: col.internal(integer('reading')),
  reasonCode: col.ref('core_terms', { nullable: true }),
  // About the thing, not a person: anything about a person belongs in an incident.
  reasonNote: col.internal(text('reason_note')),
  doneBy: col.account('done_by', { role: 'actor' }),
  // The device's time when the entry was queued offline.
  doneAt: col.timestamp('done_at').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cke',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_checklist_entries_item').on(t.runId, t.itemId),
    check('front_of_house_checklist_entries_outcome', sql`${t.outcome} IN ('done', 'exception', 'not_applicable')`),
    check('front_of_house_checklist_entries_reason', sql`${t.outcome} <> 'exception' OR ${t.reasonCode} IS NOT NULL`),
    check('front_of_house_checklist_entries_note', sql`${t.reasonNote} IS NULL OR length(${t.reasonNote}) <= 200`),
  ],
})

/** A venue's evacuation and emergency instructions, kept on the device. */
export const emergencyCards = defineTable('front_of_house_emergency_cards', {
  id: col.id(),
  venueId: col.internal(text('venue_id').notNull()),
  // Markdown: routes, assembly point, who to call. Role titles and switchboard numbers, not private numbers.
  body: col.internal(text('body').notNull()),
  reviewedOn: col.localDate('reviewed_on').notNull(),
  reviewedBy: col.account('reviewed_by', { role: 'actor' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'emg',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_emergency_cards_venue').on(t.venueId),
    check('front_of_house_emergency_cards_body', sql`length(${t.body}) BETWEEN 1 AND 8000`),
  ],
})

export const INCIDENT_KINDS = ['incident', 'near_miss'] as const
export const SEVERITIES = ['minor', 'moderate', 'serious'] as const
export const INCIDENT_STATES = ['reported', 'in_review', 'closed'] as const
export const INVOLVEMENTS = ['affected', 'witness', 'helped', 'other'] as const

// Free text about an incident is the safety record: it outlives an erasure for the retention period.
const kept = { erase: 'retain', until: 'front-of-house.retention.incidents', reason: 'front-of-house.retain.incident' } as const

/**
 * An incident or near miss. The row's own facts (number, kind, severity, dates) are the theatre's
 * history; its free text may describe anyone listed on it, so it is kept for the retention period.
 */
export const incidents = defineTable('front_of_house_incidents', {
  id: col.id(),
  number: col.internal(integer('number').notNull()),
  year: col.internal(integer('year').notNull()),
  kind: col.internal(text('kind', { enum: INCIDENT_KINDS }).notNull()),
  categoryId: col.ref('core_terms', { nullable: true }),
  severity: col.internal(text('severity', { enum: SEVERITIES }).notNull().default('minor')),
  state: col.internal(text('state', { enum: INCIDENT_STATES }).notNull().default('reported')),
  performanceId: col.internal(text('performance_id')),
  venueId: col.internal(text('venue_id')),
  spaceId: col.internal(text('space_id')),
  whereNote: col.internal(text('where_note')),
  occurredAt: col.timestamp('occurred_at').notNull(),
  whatHappened: col.freeText(text('what_happened').notNull(), kept),
  immediateAction: col.freeText(text('immediate_action'), kept),
  firstAidGiven: col.internal(integer('first_aid_given', { mode: 'boolean' }).notNull().default(false)),
  emergencyServicesCalled: col.internal(integer('emergency_services_called', { mode: 'boolean' }).notNull().default(false)),
  reportedBy: col.account('reported_by', { role: 'actor' }),
  reportedAt: col.timestamp('reported_at').notNull(),
  reviewerId: col.account('reviewer_id', { role: 'actor', nullable: true }),
  closedBy: col.account('closed_by', { role: 'actor', nullable: true }),
  closedAt: col.timestamp('closed_at'),
  closingNote: col.freeText(text('closing_note'), kept),
  // Set once the daily digest has carried it, for incidents below the immediate severity.
  digestedAt: col.timestamp('digested_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'inc',
  realm: 'operational',
  retention: 'front-of-house.retention.incidents',
  extra: t => [
    uniqueIndex('front_of_house_incidents_number').on(t.year, t.number),
    index('front_of_house_incidents_state').on(t.state, t.reportedAt),
    index('front_of_house_incidents_reporter').on(t.reportedBy),
    check('front_of_house_incidents_kind', sql`${t.kind} IN (${list(INCIDENT_KINDS)})`),
    check('front_of_house_incidents_severity', sql`${t.severity} IN (${list(SEVERITIES)})`),
    check('front_of_house_incidents_state', sql`${t.state} IN (${list(INCIDENT_STATES)})`),
    // Either flag raises the severity to at least moderate.
    check('front_of_house_incidents_floor', sql`${t.severity} <> 'minor' OR (${t.firstAidGiven} = 0 AND ${t.emergencyServicesCalled} = 0)`),
    check('front_of_house_incidents_where', sql`${t.whereNote} IS NULL OR length(${t.whereNote}) <= 120`),
    check('front_of_house_incidents_what', sql`length(${t.whatHappened}) BETWEEN 1 AND 4000`),
    check('front_of_house_incidents_action', sql`${t.immediateAction} IS NULL OR length(${t.immediateAction}) <= 2000`),
    check('front_of_house_incidents_closing', sql`${t.closingNote} IS NULL OR length(${t.closingNote}) <= 2000`),
    check('front_of_house_incidents_closed', sql`${t.state} <> 'closed' OR (${t.closedAt} IS NOT NULL AND ${t.closingNote} IS NOT NULL)`),
  ],
})

/** A person involved in an incident: an account when they have one, otherwise a name and contact. */
export const incidentPeople = defineTable('front_of_house_incident_people', {
  id: col.id(),
  incidentId: col.ref('front_of_house_incidents'),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  name: col.personal(text('name'), kept),
  contact: col.personal(text('contact'), kept),
  involvement: col.internal(text('involvement', { enum: INVOLVEMENTS }).notNull()),
  isChild: col.internal(integer('is_child', { mode: 'boolean' }).notNull().default(false)),
  // Injury and treatment. Sealed; cleared at once on erasure.
  details: col.special('details'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'inp',
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  retention: 'front-of-house.retention.incidents',
  extra: t => [
    index('front_of_house_incident_people_incident').on(t.incidentId),
    index('front_of_house_incident_people_account').on(t.accountId).where(sql`account_id IS NOT NULL`),
    check('front_of_house_incident_people_who', sql`${t.accountId} IS NOT NULL OR ${t.name} IS NOT NULL`),
    check('front_of_house_incident_people_name', sql`${t.name} IS NULL OR length(${t.name}) <= 120`),
    check('front_of_house_incident_people_contact', sql`${t.contact} IS NULL OR length(${t.contact}) <= 200`),
    check('front_of_house_incident_people_involvement', sql`${t.involvement} IN (${list(INVOLVEMENTS)})`),
  ],
})

/** A follow-up action: something to do about a thing, never about a person. */
export const incidentActions = defineTable('front_of_house_incident_actions', {
  id: col.id(),
  incidentId: col.ref('front_of_house_incidents'),
  what: col.internal(text('what').notNull()),
  ownerId: col.account('owner_id', { role: 'actor', nullable: true }),
  dueOn: col.localDate('due_on'),
  state: col.internal(text('state', { enum: ['open', 'done', 'dropped'] }).notNull().default('open')),
  resolvedAt: col.timestamp('resolved_at'),
  resolvedNote: col.internal(text('resolved_note')),
  // The last day the owner was reminded, so a re-run of the daily task sends nothing twice.
  chasedOn: col.localDate('chased_on'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ina',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('front_of_house_incident_actions_incident').on(t.incidentId),
    index('front_of_house_incident_actions_due').on(t.state, t.dueOn),
    check('front_of_house_incident_actions_what', sql`length(${t.what}) BETWEEN 1 AND 300`),
    check('front_of_house_incident_actions_state', sql`${t.state} IN ('open', 'done', 'dropped')`),
    check('front_of_house_incident_actions_note', sql`${t.resolvedNote} IS NULL OR length(${t.resolvedNote}) <= 300`),
    check('front_of_house_incident_actions_dropped', sql`${t.state} <> 'dropped' OR ${t.resolvedNote} IS NOT NULL`),
  ],
})

/** The log of an incident: comments and every change of state, severity and category. */
export const incidentUpdates = defineTable('front_of_house_incident_updates', {
  id: col.id(),
  incidentId: col.ref('front_of_house_incidents'),
  kind: col.internal(text('kind', { enum: ['comment', 'state', 'severity', 'category'] }).notNull()),
  fromValue: col.internal(text('from_value')),
  toValue: col.internal(text('to_value')),
  body: col.freeText(text('body'), kept),
  authorId: col.account('author_id', { role: 'actor' }),
  createdAt: col.createdAt(),
}, {
  id: 'inu',
  realm: 'operational',
  subject: { via: 'incident_id' },
  retention: 'front-of-house.retention.incidents',
  appendOnly: true,
  extra: t => [
    index('front_of_house_incident_updates_incident').on(t.incidentId, t.createdAt),
    check('front_of_house_incident_updates_kind', sql`${t.kind} IN ('comment', 'state', 'severity', 'category')`),
    check('front_of_house_incident_updates_body', sql`${t.body} IS NULL OR length(${t.body}) <= 2000`),
  ],
})

export const NOTE_TOPICS = ['audience', 'building', 'show', 'staffing', 'other'] as const

/**
 * The record of one performance. A draft is a live view; sign-off writes the snapshot, which holds no
 * names and no free text. A trigger (written by hand in the migration) refuses any change to a
 * signed-off row except setting distributed_at.
 */
export const nightReports = defineTable('front_of_house_night_reports', {
  id: col.id(),
  performanceId: col.internal(text('performance_id').notNull()),
  state: col.internal(text('state', { enum: ['draft', 'signed_off'] }).notNull().default('draft')),
  snapshot: col.internal(text('snapshot', { mode: 'json' })),
  snapshotVersion: col.internal(integer('snapshot_version').notNull().default(1)),
  signedOffBy: col.account('signed_off_by', { role: 'actor', nullable: true }),
  signedOffAt: col.timestamp('signed_off_at'),
  distributedAt: col.timestamp('distributed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'nrp',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('front_of_house_night_reports_performance').on(t.performanceId),
    index('front_of_house_night_reports_state').on(t.state),
    check('front_of_house_night_reports_state', sql`${t.state} IN ('draft', 'signed_off')`),
    check('front_of_house_night_reports_signed', sql`${t.state} = 'draft' OR (${t.snapshot} IS NOT NULL AND ${t.signedOffAt} IS NOT NULL)`),
  ],
})

/** Notes on the night by topic, and addenda written after sign-off. About the night, never a person. */
export const nightReportNotes = defineTable('front_of_house_night_report_notes', {
  id: col.id(),
  reportId: col.ref('front_of_house_night_reports'),
  kind: col.internal(text('kind', { enum: ['note', 'addendum'] }).notNull()),
  topic: col.internal(text('topic', { enum: NOTE_TOPICS }).notNull()),
  body: col.internal(text('body').notNull()),
  authorId: col.account('author_id', { role: 'actor' }),
  createdAt: col.createdAt(),
}, {
  id: 'nrn',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('front_of_house_night_report_notes_report').on(t.reportId, t.createdAt),
    check('front_of_house_night_report_notes_kind', sql`${t.kind} IN ('note', 'addendum')`),
    check('front_of_house_night_report_notes_topic', sql`${t.topic} IN (${list(NOTE_TOPICS)})`),
    check('front_of_house_night_report_notes_body', sql`length(${t.body}) BETWEEN 1 AND 2000`),
  ],
})

export const tables = { nightReports, nightReportNotes, duties, rotaTemplates, rotaTemplateLines, shifts, assignments, timings, checklists, checklistItems, checklistRuns, checklistEntries, emergencyCards, incidents, incidentPeople, incidentActions, incidentUpdates }
