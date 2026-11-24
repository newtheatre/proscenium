// Programme planning (spec part 2): the plan for one season, the entries that might be programmed,
// and the placements tying an entry to a core performance. A placement never copies a time: the
// performance's start, end and space are core's. Later slices add the call, pencils and notices.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import { ENTRY_KINDS, ENTRY_SHAPES, ENTRY_SOURCES, ENTRY_STATES, PLAN_STATES, RIGHTS, WITHDRAWN_REASONS } from '../../shared/plans'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))
const clock = (c: unknown) => sql`(${c} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${c} <= '24:00')`

/** One season's plan. `version` rises with every board write, so a stale write is refused (P8). */
export const plans = defineTable('programme_planning_plans', {
  id: col.id(),
  seasonId: col.ref('core_seasons'),
  state: col.internal(text('state', { enum: PLAN_STATES }).notNull().default('planning')),
  boardFrom: col.localDate('board_from').notNull(),
  boardTo: col.localDate('board_to').notNull(),
  dayStarts: col.internal(text('day_starts').notNull().default('09:00')),
  dayEnds: col.internal(text('day_ends').notNull().default('00:00')),
  callOpensAt: col.timestamp('call_opens_at'),
  callClosesAt: col.timestamp('call_closes_at'),
  publishProductions: col.internal(integer('publish_productions', { mode: 'boolean' }).notNull()),
  publishedAt: col.timestamp('published_at'),
  publishedBy: col.account('published_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  version: col.internal(integer('version').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'pppl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('programme_planning_plans_season').on(t.seasonId),
    check('programme_planning_plans_state', sql`${t.state} IN (${inList(PLAN_STATES)})`),
    check('programme_planning_plans_board', sql`${t.boardTo} >= ${t.boardFrom}`),
    check('programme_planning_plans_hours', sql`${clock(t.dayStarts)} AND ${clock(t.dayEnds)} AND (${t.dayEnds} > ${t.dayStarts} OR ${t.dayEnds} = '00:00')`),
    check('programme_planning_plans_call', sql`${t.callClosesAt} IS NULL OR ${t.callOpensAt} IS NULL OR ${t.callClosesAt} > ${t.callOpensAt}`),
  ],
})

/** One thing that might be programmed. It belongs to one plan for good (E1). */
export const entries = defineTable('programme_planning_entries', {
  id: col.id(),
  planId: col.ref('programme_planning_plans'),
  source: col.internal(text('source', { enum: ENTRY_SOURCES }).notNull()),
  sourceRef: col.internal(text('source_ref')),
  title: col.internal(text('title').notNull()),
  kind: col.internal(text('kind', { enum: ENTRY_KINDS }).notNull()),
  categoryTermId: col.ref('core_terms', { nullable: true }),
  state: col.internal(text('state', { enum: ENTRY_STATES }).notNull().default('candidate')),
  productionId: col.ref('core_productions', { nullable: true }),
  companyId: col.internal(text('company_id')),
  applicantAccountId: col.account('applicant_account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  minutes: col.internal(integer('minutes')),
  getInMinutes: col.internal(integer('get_in_minutes').notNull().default(0)),
  getOutMinutes: col.internal(integer('get_out_minutes').notNull().default(0)),
  performancesWanted: col.internal(integer('performances_wanted').notNull().default(1)),
  shape: col.internal(text('shape', { enum: ENTRY_SHAPES }).notNull().default('timed')),
  rightsStatus: col.internal(text('rights_status', { enum: RIGHTS }).notNull().default('unknown')),
  collectionIds: col.internal(text('collection_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  staffNote: col.freeText(text('staff_note')),
  decidedAt: col.timestamp('decided_at'),
  withdrawnReason: col.internal(text('withdrawn_reason', { enum: WITHDRAWN_REASONS })),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ppen',
  realm: 'members',
  subject: { account: 'applicant_account_id', unlinked: 'staff' },
  extra: t => [
    index('programme_planning_entries_plan').on(t.planId, t.state),
    uniqueIndex('programme_planning_entries_production').on(t.productionId),
    uniqueIndex('programme_planning_entries_source_ref').on(t.sourceRef).where(sql`${t.sourceRef} IS NOT NULL AND ${t.state} IN ('candidate', 'accepted')`),
    check('programme_planning_entries_source', sql`${t.source} IN (${inList(ENTRY_SOURCES)})`),
    check('programme_planning_entries_kind', sql`${t.kind} IN (${inList(ENTRY_KINDS)})`),
    check('programme_planning_entries_state', sql`${t.state} IN (${inList(ENTRY_STATES)})`),
    check('programme_planning_entries_shape', sql`${t.shape} IN (${inList(ENTRY_SHAPES)})`),
    check('programme_planning_entries_rights', sql`${t.rightsStatus} IN (${inList(RIGHTS)})`),
    check('programme_planning_entries_withdrawn', sql`${t.withdrawnReason} IS NULL OR ${t.withdrawnReason} IN (${inList(WITHDRAWN_REASONS)})`),
    check('programme_planning_entries_title', sql`length(${t.title}) BETWEEN 1 AND 200`),
    check('programme_planning_entries_source_ref_length', sql`${t.sourceRef} IS NULL OR length(${t.sourceRef}) <= 80`),
    check('programme_planning_entries_minutes', sql`${t.minutes} IS NULL OR ${t.minutes} BETWEEN 1 AND 1440`),
    check('programme_planning_entries_get_in', sql`${t.getInMinutes} BETWEEN 0 AND 720 AND ${t.getOutMinutes} BETWEEN 0 AND 720`),
    check('programme_planning_entries_wanted', sql`${t.performancesWanted} BETWEEN 1 AND 60`),
    check('programme_planning_entries_note', sql`${t.staffNote} IS NULL OR length(${t.staffNote}) <= 2000`),
    check('programme_planning_entries_accepted', sql`(${t.state} = 'accepted') = (${t.productionId} IS NOT NULL) OR ${t.state} = 'withdrawn'`),
  ],
})

/** An entry placed on a core performance: one row per performance, or several sharing a host's line-up. */
export const placements = defineTable('programme_planning_placements', {
  performanceId: col.ref('core_performances'),
  entryId: col.ref('programme_planning_entries'),
  lineUpItemId: col.internal(text('line_up_item_id')),
  offeredSlotId: col.internal(text('offered_slot_id')),
  toldFingerprint: col.internal(text('told_fingerprint')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.performanceId, t.entryId] }),
    index('programme_planning_placements_entry').on(t.entryId),
    check('programme_planning_placements_fingerprint', sql`${t.toldFingerprint} IS NULL OR length(${t.toldFingerprint}) <= 64`),
  ],
})

export const tables = { plans, entries, placements }
