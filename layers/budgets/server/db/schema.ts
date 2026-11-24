// Budgets and claims (third round, spec 8), part 2: the plan. A budget's lines carry the amounts set on
// them (append-only), and nothing holds a spent total: spend is read from Finance through the budget
// line each ledger entry carries. Requests and claims add their tables with their stories.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** What money is spent on, each mapped to an expense account given to Budgets. */
export const categories = defineTable('budgets_categories', {
  id: col.id(),
  slug: col.internal(text('slug').notNull()),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description').notNull().default('')),
  // A Finance expense account given to budgets; null posts to budgets.expenses.
  accountId: col.internal(text('account_id')),
  sortOrder: col.internal(integer('sort_order').notNull()),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bct',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('budgets_categories_slug').on(t.slug),
    uniqueIndex('budgets_categories_name').on(t.name).where(sql`archived_at IS NULL`),
    check('budgets_categories_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('budgets_categories_description_length', sql`length(${t.description}) <= 300`),
  ],
})

/** A budget: for a production, a department and finance year, a season, or a general purpose. */
export const budgets = defineTable('budgets_budgets', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  scope: col.internal(text('scope', { enum: ['production', 'department', 'season', 'general'] }).notNull()),
  productionId: col.ref('core_productions', { nullable: true }),
  seasonId: col.ref('core_seasons', { nullable: true }),
  departmentTermId: col.ref('core_terms', { nullable: true }),
  yearStartsOn: col.localDate('year_starts_on').notNull(),
  // The line of a larger budget this one is funded from.
  parentLineId: col.internal(text('parent_line_id')),
  currency: col.currency('currency').notNull(),
  state: col.internal(text('state', { enum: ['draft', 'proposed', 'approved', 'closed'] }).notNull().default('draft')),
  proposedBy: col.account('proposed_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  // The latest note from sending back or reopening; the audit keeps that it happened.
  note: col.internal(text('note')),
  approvedBy: col.account('approved_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  approvedAt: col.timestamp('approved_at'),
  closedAt: col.timestamp('closed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bgt',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    check('budgets_budgets_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('budgets_budgets_scope', sql`${t.scope} IN ('production', 'department', 'season', 'general')`),
    check('budgets_budgets_note', sql`${t.note} IS NULL OR length(${t.note}) <= 300`),
    check('budgets_budgets_state', sql`${t.state} IN ('draft', 'proposed', 'approved', 'closed')`),
    check('budgets_budgets_scope_ref', sql`(${t.scope} = 'production') = (${t.productionId} IS NOT NULL) AND (${t.scope} = 'season') = (${t.seasonId} IS NOT NULL) AND (${t.scope} = 'department') = (${t.departmentTermId} IS NOT NULL)`),
    // One live budget per production, per season, and per department and year.
    uniqueIndex('budgets_budgets_production').on(t.productionId).where(sql`production_id IS NOT NULL AND state <> 'closed'`),
    uniqueIndex('budgets_budgets_season').on(t.seasonId).where(sql`season_id IS NOT NULL AND state <> 'closed'`),
    uniqueIndex('budgets_budgets_department').on(t.departmentTermId, t.yearStartsOn).where(sql`department_term_id IS NOT NULL AND state <> 'closed'`),
    index('budgets_budgets_year').on(t.yearStartsOn),
    index('budgets_budgets_parent').on(t.parentLineId),
  ],
})

/** One line of a budget; its id is what ledger entries carry as budget_line_id. */
export const lines = defineTable('budgets_lines', {
  id: col.id(),
  budgetId: col.ref('budgets_budgets'),
  name: col.internal(text('name').notNull()),
  kind: col.internal(text('kind', { enum: ['expense', 'income'] }).notNull()),
  categoryId: col.ref('budgets_categories', { nullable: true }),
  sortOrder: col.internal(integer('sort_order').notNull()),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bgl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('budgets_lines_name').on(t.budgetId, t.name).where(sql`archived_at IS NULL`),
    index('budgets_lines_budget').on(t.budgetId, t.sortOrder),
    check('budgets_lines_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('budgets_lines_kind', sql`${t.kind} IN ('expense', 'income')`),
    check('budgets_lines_category', sql`${t.kind} = 'income' OR ${t.categoryId} IS NOT NULL`),
  ],
})

/** An amount set on a line: drafts change freely before approval, approved ones only by a revision. */
export const lineAmounts = defineTable('budgets_line_amounts', {
  id: col.id(),
  lineId: col.ref('budgets_lines'),
  amountMinor: col.minor('amount_minor').notNull(),
  stage: col.internal(text('stage', { enum: ['draft', 'approved'] }).notNull()),
  reason: col.internal(text('reason')),
  setBy: col.account('set_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  setAt: col.timestamp('set_at').notNull(),
}, {
  id: 'bga',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('budgets_line_amounts_line').on(t.lineId, t.stage, t.setAt),
    check('budgets_line_amounts_amount', sql`${t.amountMinor} >= 0`),
    check('budgets_line_amounts_stage', sql`${t.stage} IN ('draft', 'approved')`),
    check('budgets_line_amounts_reason', sql`${t.reason} IS NULL OR length(${t.reason}) <= 200`),
  ],
})

/** Which Finance accounts an income line reads, by system key. */
export const lineSources = defineTable('budgets_line_sources', {
  lineId: col.ref('budgets_lines'),
  accountKey: col.internal(text('account_key').notNull()),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.lineId, t.accountKey] })],
})

export const REQUEST_STATES = ['requested', 'approved', 'declined', 'withdrawn', 'fulfilled', 'lapsed'] as const

/** Asking to spend on a line before spending (BC-15): once approved, it counts as committed until it is fulfilled or lapses. */
export const requests = defineTable('budgets_spending_requests', {
  id: col.id(),
  // Null for a request a module made, such as a licence fee, and once retention has passed.
  requestedBy: col.account('requested_by', { role: 'subject', onMerge: 'alias', nullable: true }),
  lineId: col.ref('budgets_lines'),
  amountMinor: col.minor('amount_minor').notNull(),
  description: col.freeText(text('description').notNull()),
  neededBy: col.localDate('needed_by'),
  state: col.internal(text('state', { enum: REQUEST_STATES }).notNull()),
  decidedBy: col.account('decided_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  // Seen by the requester; required when declining.
  decisionNote: col.freeText(text('decision_note')),
  fulfilledMinor: col.minor('fulfilled_minor').notNull().default(0),
  lapsesOn: col.localDate('lapses_on'),
  sourceModule: col.internal(text('source_module')),
  sourceType: col.internal(text('source_type')),
  sourceId: col.internal(text('source_id')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bgr',
  realm: 'members',
  subject: { account: 'requested_by', unlinked: 'staff' },
  // Counted from the decision by the module's daily task.
  retention: 'budgets.retention.requests',
  extra: t => [
    index('budgets_spending_requests_line').on(t.lineId, t.state),
    index('budgets_spending_requests_by').on(t.requestedBy, t.createdAt),
    index('budgets_spending_requests_state').on(t.state, t.createdAt),
    uniqueIndex('budgets_spending_requests_source').on(t.sourceModule, t.sourceType, t.sourceId).where(sql`source_id IS NOT NULL`),
    check('budgets_spending_requests_amount', sql`${t.amountMinor} > 0`),
    check('budgets_spending_requests_fulfilled', sql`${t.fulfilledMinor} BETWEEN 0 AND ${t.amountMinor}`),
    check('budgets_spending_requests_description', sql`length(${t.description}) <= 500`),
    check('budgets_spending_requests_note', sql`${t.decisionNote} IS NULL OR length(${t.decisionNote}) <= 500`),
    check('budgets_spending_requests_state', sql`${t.state} IN ('requested', 'approved', 'declined', 'withdrawn', 'fulfilled', 'lapsed')`),
    check('budgets_spending_requests_declined', sql`${t.state} <> 'declined' OR ${t.decisionNote} IS NOT NULL`),
    check('budgets_spending_requests_source', sql`(${t.sourceModule} IS NULL) = (${t.sourceId} IS NULL) AND (${t.sourceType} IS NULL) = (${t.sourceId} IS NULL)`),
  ],
})

export const tables = { categories, budgets, lines, lineAmounts, lineSources, requests }
