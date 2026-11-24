// Inventory: fourteen tables (spec part 2). An item is promised only by the shape of the write that
// promises it (server/promise.ts), because SQLite cannot forbid overlapping windows.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import {
  CANCEL_REASONS, CERTIFICATE, CONDITIONS, DISPOSAL_METHODS, DISPOSAL_STATES, DUE_BACK_SET, DUE_SOURCES, FAULT_SOURCES, FAULT_STATES, ITEM_EVENT_KINDS, ITEM_STATES,
  LENDS_TO, LINE_STATES, LOAN_KINDS, LOAN_STATES, OUT_OF_SERVICE_REASONS, OWNERSHIP, RECORD_STATES, RESULTS, TRACKING,
} from '../../shared/states'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))
const requirements = () => col.internal(text('requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`))
const flag = (name: string, on: boolean) => col.internal(integer(name, { mode: 'boolean' }).notNull().default(on))

/** Kit departments: the unit of authority, each with its tag counter and who it lends to. */
export const departments = defineTable('inventory_departments', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  tagPrefix: col.internal(text('tag_prefix').notNull()),
  // I2: the contended counter tags are made from, read and raised inside the adding statements.
  nextTagNumber: col.internal(integer('next_tag_number').notNull().default(1)),
  lendsTo: col.internal(text('lends_to', { enum: LENDS_TO }).notNull().default('members')),
  requirements: requirements(),
  guidance: col.internal(text('guidance')),
  contact: col.internal(text('contact')),
  departmentTermId: col.ref('core_terms', { nullable: true }),
  state: col.internal(text('state', { enum: RECORD_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kdp',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_departments_name').on(sql`lower(${t.name})`).where(sql`state = 'active'`),
    uniqueIndex('inventory_departments_prefix').on(t.tagPrefix),
    check('inventory_departments_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('inventory_departments_prefix_shape', sql`${t.tagPrefix} GLOB '[A-Z]*' AND length(${t.tagPrefix}) BETWEEN 1 AND 4 AND ${t.tagPrefix} NOT GLOB '*[^A-Z]*'`),
    check('inventory_departments_counter', sql`${t.nextTagNumber} >= 1`),
    check('inventory_departments_lends_to', sql`${t.lendsTo} IN (${inList(LENDS_TO)})`),
    check('inventory_departments_guidance', sql`${t.guidance} IS NULL OR length(${t.guidance}) <= 2000`),
    check('inventory_departments_contact', sql`${t.contact} IS NULL OR length(${t.contact}) <= 200`),
    check('inventory_departments_state', sql`${t.state} IN (${inList(RECORD_STATES)})`),
  ],
})

export const categories = defineTable('inventory_categories', {
  id: col.id(),
  departmentId: col.ref('inventory_departments'),
  name: col.internal(text('name').notNull()),
  requirements: requirements(),
  state: col.internal(text('state', { enum: RECORD_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kcat',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_categories_name').on(t.departmentId, sql`lower(${t.name})`).where(sql`state = 'active'`),
    check('inventory_categories_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('inventory_categories_state', sql`${t.state} IN (${inList(RECORD_STATES)})`),
  ],
})

/** Stores, rooms, rails and shelves, as a tree at most four deep (I5, I8). */
export const locations = defineTable('inventory_locations', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  parentId: col.ref('inventory_locations', { nullable: true }),
  venueId: col.ref('core_venues', { nullable: true }),
  spaceId: col.ref('core_spaces', { nullable: true }),
  state: col.internal(text('state', { enum: RECORD_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kloc',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_locations_name').on(sql`coalesce(${t.parentId}, '')`, sql`lower(${t.name})`).where(sql`state = 'active'`),
    index('inventory_locations_parent').on(t.parentId),
    check('inventory_locations_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('inventory_locations_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    check('inventory_locations_state', sql`${t.state} IN (${inList(RECORD_STATES)})`),
  ],
})

/** Every item: one thing, or a counted set of alike things. */
export const items = defineTable('inventory_items', {
  id: col.id(),
  categoryId: col.ref('inventory_categories'),
  tag: col.internal(text('tag').notNull()),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  tracking: col.internal(text('tracking', { enum: TRACKING }).notNull()),
  quantity: col.internal(integer('quantity').notNull().default(1)),
  homeLocationId: col.ref('inventory_locations'),
  currentLocationId: col.ref('inventory_locations', { nullable: true }),
  containerId: col.ref('inventory_items', { nullable: true }),
  state: col.internal(text('state', { enum: ITEM_STATES }).notNull().default('active')),
  outOfServiceReason: col.internal(text('out_of_service_reason', { enum: OUT_OF_SERVICE_REASONS })),
  condition: col.internal(text('condition', { enum: CONDITIONS }).notNull().default('good')),
  lendable: flag('lendable', true),
  requirements: requirements(),
  make: col.internal(text('make')),
  model: col.internal(text('model')),
  serialNumber: col.internal(text('serial_number')),
  acquiredOn: col.localDate('acquired_on'),
  replacementValue: col.minor('replacement_value'),
  currency: col.currency('currency').notNull(),
  ownership: col.internal(text('ownership', { enum: OWNERSHIP }).notNull().default('owned')),
  ownerName: col.internal(text('owner_name')),
  ownerCompanyRef: col.internal(text('owner_company_ref')),
  ownerDueBackOn: col.localDate('owner_due_back_on'),
  createdBy: col.account('created_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kit',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_items_tag').on(t.tag),
    index('inventory_items_category').on(t.categoryId, t.state),
    index('inventory_items_home').on(t.homeLocationId),
    index('inventory_items_container').on(t.containerId),
    index('inventory_items_name').on(sql`lower(${t.name})`),
    check('inventory_items_name_length', sql`length(${t.name}) BETWEEN 1 AND 120`),
    check('inventory_items_description', sql`${t.description} IS NULL OR length(${t.description}) <= 4000`),
    check('inventory_items_tracking', sql`${t.tracking} IN (${inList(TRACKING)})`),
    check('inventory_items_quantity', sql`(${t.tracking} = 'individual' AND ${t.quantity} = 1) OR (${t.tracking} = 'counted' AND ${t.quantity} >= 0)`),
    check('inventory_items_state', sql`${t.state} IN (${inList(ITEM_STATES)})`),
    check('inventory_items_out_of_service', sql`(${t.state} = 'out-of-service') = (${t.outOfServiceReason} IS NOT NULL)`),
    check('inventory_items_condition', sql`${t.condition} IN (${inList(CONDITIONS)})`),
    check('inventory_items_not_own_container', sql`${t.containerId} IS NULL OR ${t.containerId} <> ${t.id}`),
    check('inventory_items_details', sql`coalesce(length(${t.make}), 0) <= 80 AND coalesce(length(${t.model}), 0) <= 80 AND coalesce(length(${t.serialNumber}), 0) <= 80`),
    check('inventory_items_value', sql`${t.replacementValue} IS NULL OR ${t.replacementValue} >= 0`),
    check('inventory_items_ownership', sql`${t.ownership} IN (${inList(OWNERSHIP)})`),
    check('inventory_items_owner', sql`${t.ownership} = 'owned' OR (${t.ownerName} IS NOT NULL AND length(${t.ownerName}) BETWEEN 1 AND 120 AND ${t.ownerDueBackOn} IS NOT NULL)`),
  ],
})

export const itemTags = defineTable('inventory_item_tags', {
  itemId: col.ref('inventory_items'),
  termId: col.ref('core_terms'),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.itemId, t.termId] }), index('inventory_item_tags_term').on(t.termId)],
})

/** Everything that happened to an item, in order. Holds codes only, never words about a person. */
export const itemEvents = defineTable('inventory_item_events', {
  id: col.id(),
  itemId: col.ref('inventory_items'),
  kind: col.internal(text('kind', { enum: ITEM_EVENT_KINDS }).notNull()),
  loanId: col.ref('inventory_loans', { nullable: true }),
  inspectionId: col.ref('inventory_inspections', { nullable: true }),
  faultId: col.ref('inventory_faults', { nullable: true }),
  disposalId: col.ref('inventory_disposals', { nullable: true }),
  fromLocationId: col.ref('inventory_locations', { nullable: true }),
  toLocationId: col.ref('inventory_locations', { nullable: true }),
  condition: col.internal(text('condition', { enum: CONDITIONS })),
  reason: col.internal(text('reason')),
  actor: col.account('actor', { role: 'actor', nullable: true }),
  at: col.timestamp('at').notNull(),
}, {
  id: 'kev',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('inventory_item_events_item').on(t.itemId, t.at),
    check('inventory_item_events_kind', sql`${t.kind} IN (${inList(ITEM_EVENT_KINDS)})`),
    check('inventory_item_events_reason', sql`${t.reason} IS NULL OR ${t.reason} GLOB '[a-z]*' AND ${t.reason} NOT GLOB '*[^a-z-]*'`),
  ],
})

export const inspectionKinds = defineTable('inventory_inspection_kinds', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  intervalDays: col.internal(integer('interval_days').notNull()),
  inspectorRequirements: col.internal(text('inspector_requirements', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  contractorAllowed: flag('contractor_allowed', true),
  certificate: col.internal(text('certificate', { enum: CERTIFICATE }).notNull().default('optional')),
  blocksWhenOverdue: flag('blocks_when_overdue', true),
  state: col.internal(text('state', { enum: RECORD_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kik',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_inspection_kinds_name').on(sql`lower(${t.name})`).where(sql`state = 'active'`),
    check('inventory_inspection_kinds_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('inventory_inspection_kinds_description', sql`${t.description} IS NULL OR length(${t.description}) <= 2000`),
    check('inventory_inspection_kinds_interval', sql`${t.intervalDays} BETWEEN 1 AND 3650`),
    check('inventory_inspection_kinds_certificate', sql`${t.certificate} IN (${inList(CERTIFICATE)})`),
    check('inventory_inspection_kinds_state', sql`${t.state} IN (${inList(RECORD_STATES)})`),
  ],
})

export const categoryInspections = defineTable('inventory_category_inspections', {
  categoryId: col.ref('inventory_categories'),
  kindId: col.ref('inventory_inspection_kinds'),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.categoryId, t.kindId] })],
})

/** The one place a due date lives (N1): written in the same unit as whatever changes it. */
export const inspectionDues = defineTable('inventory_inspection_dues', {
  itemId: col.ref('inventory_items'),
  kindId: col.ref('inventory_inspection_kinds'),
  source: col.internal(text('source', { enum: DUE_SOURCES }).notNull()),
  applies: flag('applies', true),
  nextDueOn: col.localDate('next_due_on'),
  lastInspectionId: col.ref('inventory_inspections', { nullable: true }),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.itemId, t.kindId] }),
    index('inventory_inspection_dues_next').on(t.nextDueOn).where(sql`applies = 1`),
    check('inventory_inspection_dues_source', sql`${t.source} IN (${inList(DUE_SOURCES)})`),
    check('inventory_inspection_dues_excused', sql`${t.applies} = 1 OR ${t.nextDueOn} IS NULL`),
  ],
})

export const inspections = defineTable('inventory_inspections', {
  id: col.id(),
  itemId: col.ref('inventory_items'),
  kindId: col.ref('inventory_inspection_kinds'),
  doneOn: col.localDate('done_on').notNull(),
  result: col.internal(text('result', { enum: RESULTS }).notNull()),
  readings: col.internal(text('readings')),
  contractor: col.internal(text('contractor')),
  nextDueOn: col.localDate('next_due_on'),
  supersedesId: col.ref('inventory_inspections', { nullable: true }),
  requirementOverriddenBy: col.account('requirement_overridden_by', { role: 'actor', nullable: true }),
  recordedBy: col.account('recorded_by', { role: 'actor' }),
  createdAt: col.createdAt(),
}, {
  id: 'kin',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('inventory_inspections_item').on(t.itemId, t.kindId, t.doneOn),
    uniqueIndex('inventory_inspections_supersedes').on(t.supersedesId).where(sql`supersedes_id IS NOT NULL`),
    check('inventory_inspections_result', sql`${t.result} IN (${inList(RESULTS)})`),
    check('inventory_inspections_readings', sql`${t.readings} IS NULL OR length(${t.readings}) <= 500`),
    check('inventory_inspections_contractor', sql`${t.contractor} IS NULL OR length(${t.contractor}) BETWEEN 1 AND 120`),
    check('inventory_inspections_fail_sets_no_date', sql`${t.result} = 'pass' OR ${t.nextDueOn} IS NULL`),
  ],
})

/** Loans and pull lists. One department each (L2); erased, never deleted, so item history stays whole. */
export const loans = defineTable('inventory_loans', {
  id: col.id(),
  departmentId: col.ref('inventory_departments'),
  kind: col.internal(text('kind', { enum: LOAN_KINDS }).notNull()),
  state: col.internal(text('state', { enum: LOAN_STATES }).notNull()),
  productionId: col.ref('core_productions', { nullable: true }),
  responsibleAccountId: col.account('responsible_account_id', { role: 'subject', nullable: true }),
  borrowerName: col.personal(text('borrower_name')),
  borrowerEmail: col.email('borrower_email'),
  borrowerPhone: col.personal(text('borrower_phone'), { erase: 'clear' }),
  companyRef: col.internal(text('company_ref')),
  purpose: col.freeText(text('purpose')),
  startsAt: col.timestamp('starts_at').notNull(),
  dueBackOn: col.localDate('due_back_on').notNull(),
  // L8: the close of due_back_on's operating day, kept with it so the promise check is plain SQL.
  dueBackAt: col.timestamp('due_back_at').notNull(),
  dueBackSet: col.internal(text('due_back_set', { enum: DUE_BACK_SET }).notNull().default('by-person')),
  requestedBy: col.account('requested_by', { role: 'actor', nullable: true }),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  declineNote: col.freeText(text('decline_note')),
  outAt: col.timestamp('out_at'),
  returnedAt: col.timestamp('returned_at'),
  cancelReason: col.internal(text('cancel_reason', { enum: CANCEL_REASONS })),
  lastRemindedOn: col.localDate('last_reminded_on'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kln',
  realm: 'operational',
  subject: { account: 'responsible_account_id', unlinked: 'staff' },
  retention: 'inventory.loans.keep-for',
  extra: t => [
    index('inventory_loans_due').on(t.state, t.dueBackOn),
    index('inventory_loans_production').on(t.productionId),
    index('inventory_loans_department').on(t.departmentId, t.state),
    index('inventory_loans_responsible').on(t.responsibleAccountId),
    check('inventory_loans_kind', sql`${t.kind} IN (${inList(LOAN_KINDS)})`),
    check('inventory_loans_state', sql`${t.state} IN (${inList(LOAN_STATES)})`),
    check('inventory_loans_draft', sql`${t.state} <> 'draft' OR ${t.kind} = 'production'`),
    check('inventory_loans_production', sql`(${t.kind} = 'production') = (${t.productionId} IS NOT NULL)`),
    check('inventory_loans_linked', sql`${t.responsibleAccountId} IS NOT NULL OR ${t.borrowerEmail} IS NOT NULL`),
    check('inventory_loans_responsible_kind', sql`${t.kind} = 'outside' OR ${t.responsibleAccountId} IS NOT NULL`),
    check('inventory_loans_name', sql`${t.borrowerName} IS NULL OR length(${t.borrowerName}) <= 120`),
    check('inventory_loans_phone', sql`${t.borrowerPhone} IS NULL OR length(${t.borrowerPhone}) <= 40`),
    check('inventory_loans_purpose', sql`${t.purpose} IS NULL OR length(${t.purpose}) <= 500`),
    check('inventory_loans_decline_note', sql`${t.declineNote} IS NULL OR length(${t.declineNote}) <= 500`),
    check('inventory_loans_window', sql`${t.dueBackAt} > ${t.startsAt}`),
    check('inventory_loans_due_back_set', sql`${t.dueBackSet} IN (${inList(DUE_BACK_SET)})`),
    check('inventory_loans_cancel_reason', sql`(${t.state} = 'cancelled') = (${t.cancelReason} IS NOT NULL)`),
  ],
})

/** What is on each loan; a line in Promised or Out takes its item for the loan's window (C1 to C3). */
export const loanLines = defineTable('inventory_loan_lines', {
  id: col.id(),
  loanId: col.ref('inventory_loans'),
  itemId: col.ref('inventory_items', { nullable: true }),
  wanted: col.internal(text('wanted')),
  quantity: col.internal(integer('quantity').notNull().default(1)),
  state: col.internal(text('state', { enum: LINE_STATES }).notNull()),
  withLineId: col.ref('inventory_loan_lines', { nullable: true }),
  outAt: col.timestamp('out_at'),
  returnedAt: col.timestamp('returned_at'),
  outBy: col.account('out_by', { role: 'actor', nullable: true }),
  returnedBy: col.account('returned_by', { role: 'actor', nullable: true }),
  outCondition: col.internal(text('out_condition', { enum: CONDITIONS })),
  returnedCondition: col.internal(text('returned_condition', { enum: CONDITIONS })),
  returnedQuantity: col.internal(integer('returned_quantity')),
  faultId: col.ref('inventory_faults', { nullable: true }),
  requirementOverriddenBy: col.account('requirement_overridden_by', { role: 'actor', nullable: true }),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kll',
  realm: 'operational',
  subject: { via: 'loan_id' },
  extra: t => [
    index('inventory_loan_lines_item').on(t.itemId, t.state),
    index('inventory_loan_lines_loan').on(t.loanId),
    check('inventory_loan_lines_state', sql`${t.state} IN (${inList(LINE_STATES)})`),
    check('inventory_loan_lines_wanted', sql`(${t.state} = 'wanted' AND ${t.itemId} IS NULL) OR (${t.state} <> 'wanted' AND (${t.itemId} IS NOT NULL OR ${t.state} = 'cancelled'))`),
    check('inventory_loan_lines_wanted_text', sql`${t.itemId} IS NOT NULL OR (${t.wanted} IS NOT NULL AND length(${t.wanted}) BETWEEN 1 AND 200)`),
    check('inventory_loan_lines_quantity', sql`${t.quantity} >= 1`),
    check('inventory_loan_lines_returned', sql`${t.returnedQuantity} IS NULL OR ${t.returnedQuantity} BETWEEN 0 AND ${t.quantity}`),
  ],
})

export const faults = defineTable('inventory_faults', {
  id: col.id(),
  itemId: col.ref('inventory_items'),
  state: col.internal(text('state', { enum: FAULT_STATES }).notNull().default('open')),
  takesOutOfService: flag('takes_out_of_service', true),
  description: col.freeText(text('description').notNull()),
  source: col.internal(text('source', { enum: FAULT_SOURCES }).notNull()),
  loanId: col.ref('inventory_loans', { nullable: true }),
  inspectionId: col.ref('inventory_inspections', { nullable: true }),
  productionId: col.ref('core_productions', { nullable: true }),
  reportedBy: col.account('reported_by', { role: 'actor', nullable: true }),
  resolution: col.freeText(text('resolution')),
  closedBy: col.account('closed_by', { role: 'actor', nullable: true }),
  closedAt: col.timestamp('closed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kft',
  realm: 'operational',
  retention: 'inventory.faults.keep-for',
  extra: t => [
    index('inventory_faults_item').on(t.itemId, t.state),
    check('inventory_faults_state', sql`${t.state} IN (${inList(FAULT_STATES)})`),
    check('inventory_faults_source', sql`${t.source} IN (${inList(FAULT_SOURCES)})`),
    check('inventory_faults_description', sql`length(${t.description}) BETWEEN 1 AND 2000`),
    check('inventory_faults_resolution', sql`${t.resolution} IS NULL OR length(${t.resolution}) <= 1000`),
    check('inventory_faults_closed', sql`(${t.state} = 'open') = (${t.closedAt} IS NULL)`),
  ],
})

export const disposals = defineTable('inventory_disposals', {
  id: col.id(),
  itemId: col.ref('inventory_items'),
  quantity: col.internal(integer('quantity').notNull().default(1)),
  state: col.internal(text('state', { enum: DISPOSAL_STATES }).notNull().default('proposed')),
  method: col.internal(text('method', { enum: DISPOSAL_METHODS }).notNull()),
  recipient: col.internal(text('recipient')),
  policeReference: col.internal(text('police_reference')),
  valueAtDisposal: col.minor('value_at_disposal'),
  proposedBy: col.account('proposed_by', { role: 'actor' }),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  doneAt: col.timestamp('done_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'kdis',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('inventory_disposals_open').on(t.itemId).where(sql`state IN ('proposed', 'approved')`),
    check('inventory_disposals_quantity', sql`${t.quantity} >= 1`),
    check('inventory_disposals_state', sql`${t.state} IN (${inList(DISPOSAL_STATES)})`),
    check('inventory_disposals_method', sql`${t.method} IN (${inList(DISPOSAL_METHODS)})`),
    check('inventory_disposals_recipient', sql`${t.recipient} IS NULL OR length(${t.recipient}) <= 120`),
    check('inventory_disposals_police', sql`${t.policeReference} IS NULL OR (${t.method} = 'stolen' AND length(${t.policeReference}) <= 40)`),
  ],
})

export const tables = { departments, categories, locations, items, itemTags, itemEvents, inspectionKinds, categoryInspections, inspectionDues, inspections, loans, loanLines, faults, disposals }
