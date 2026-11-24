// Companies (spec part 2): outside organisations, the people acting for them, and each one's dealings
// for a production or a hire, from enquiry to a settled account. Thirteen tables; the gate (CO-01)
// declares them all, and the slices after it fill them.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import {
  AGREEMENT_STATES, ALLOCATION_STATES, ANSWERS, CALL_KINDS, DEAL_TYPES, DEPOSIT_STATES, ENGAGEMENT_EVENT_KINDS, ENGAGEMENT_KINDS,
  ENGAGEMENT_STATES, GUEST_STATES, HIRE_FEE_BASES, LINE_KINDS, PAYMENT_DIRECTIONS, PAYMENT_METHODS, SETTLEMENT_STATES, SHARE_BASES,
} from '../../shared/companies'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))
const oneOf = (name: string, c: unknown, values: readonly string[]) => check(name, sql`${c} IN (${inList(values)})`)
const atMost = (name: string, c: unknown, n: number) => check(name, sql`${c} IS NULL OR length(${c}) <= ${sql.raw(String(n))}`)

/** An outside organisation, or a private person hiring (rule G7), whose facts then follow the person. */
export const companies = defineTable('companies_companies', {
  id: col.id(),
  name: col.perRow(text('name').notNull(), { classColumn: 'data_class' }),
  publicName: col.perRow(text('public_name'), { classColumn: 'data_class' }),
  legalName: col.perRow(text('legal_name'), { classColumn: 'data_class' }),
  registration: col.internal(text('registration')),
  taxNumber: col.internal(text('tax_number')),
  address: col.perRow(text('address'), { classColumn: 'data_class' }),
  postcode: col.perRow(text('postcode'), { classColumn: 'data_class' }),
  country: col.internal(text('country')),
  invoiceEmail: col.perRow(text('invoice_email'), { classColumn: 'data_class' }),
  website: col.public(text('website')),
  description: col.public(text('description')),
  individual: col.internal(integer('individual', { mode: 'boolean' }).notNull().default(false)),
  individualAccountId: col.account('individual_account_id', { role: 'subject', nullable: true }),
  dataClass: col.internal(text('data_class', { enum: ['public', 'personal'] }).notNull().default('public')),
  notes: col.freeText(text('notes')),
  archivedAt: col.timestamp('archived_at'),
  mergedIntoId: col.internal(text('merged_into_id')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpy',
  realm: 'operational',
  subject: { account: 'individual_account_id', unlinked: 'staff' },
  extra: t => [
    uniqueIndex('companies_companies_name').on(sql`lower(${t.name})`).where(sql`archived_at IS NULL`),
    check('companies_companies_name_length', sql`length(${t.name}) BETWEEN 1 AND 160`),
    atMost('companies_companies_public_name', t.publicName, 160),
    atMost('companies_companies_legal_name', t.legalName, 200),
    atMost('companies_companies_registration', t.registration, 60),
    atMost('companies_companies_tax_number', t.taxNumber, 30),
    atMost('companies_companies_address', t.address, 400),
    atMost('companies_companies_postcode', t.postcode, 12),
    atMost('companies_companies_description', t.description, 600),
    atMost('companies_companies_notes', t.notes, 4000),
    check('companies_companies_website', sql`${t.website} IS NULL OR (${t.website} LIKE 'https://%' AND length(${t.website}) <= 300)`),
    check('companies_companies_individual', sql`(${t.individual} = 0 AND ${t.dataClass} = 'public') OR (${t.individual} = 1 AND ${t.dataClass} = 'personal' AND ${t.individualAccountId} IS NOT NULL)`),
    check('companies_companies_merged', sql`${t.mergedIntoId} IS NULL OR ${t.archivedAt} IS NOT NULL`),
  ],
})

/** One person acting for one company. A contact who leaves is ended, never deleted (G4). */
export const contacts = defineTable('companies_contacts', {
  id: col.id(),
  companyId: col.ref('companies_companies'),
  accountId: col.account('account_id', { role: 'subject' }),
  role: col.internal(text('role')),
  isPrimary: col.internal(integer('is_primary', { mode: 'boolean' }).notNull().default(false)),
  receives: col.internal(text('receives', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  dayPhone: col.personal(text('day_phone'), { erase: 'clear' }),
  endedAt: col.timestamp('ended_at'),
  addedBy: col.account('added_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpc',
  realm: 'operational',
  retention: 'companies.contacts.keep-for',
  extra: t => [
    uniqueIndex('companies_contacts_live').on(t.companyId, t.accountId).where(sql`ended_at IS NULL`),
    uniqueIndex('companies_contacts_primary').on(t.companyId).where(sql`ended_at IS NULL AND is_primary = 1`),
    index('companies_contacts_account').on(t.accountId),
    atMost('companies_contacts_role', t.role, 80),
    atMost('companies_contacts_phone', t.dayPhone, 30),
  ],
})

/** One company's dealings for one production or hire (part 3, the engagement life cycle). */
export const engagements = defineTable('companies_engagements', {
  id: col.id(),
  companyId: col.ref('companies_companies'),
  kind: col.internal(text('kind', { enum: ENGAGEMENT_KINDS }).notNull()),
  productionId: col.internal(text('production_id')),
  seasonId: col.internal(text('season_id')),
  title: col.internal(text('title').notNull()),
  state: col.internal(text('state', { enum: ENGAGEMENT_STATES }).notNull().default('enquiry')),
  venueContactId: col.account('venue_contact_id', { role: 'actor', nullable: true }),
  techNotes: col.internal(text('tech_notes')),
  arrivalNotes: col.internal(text('arrival_notes')),
  riderFileIds: col.internal(text('rider_file_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  depositMinor: col.minor('deposit_minor').notNull().default(0),
  depositState: col.internal(text('deposit_state', { enum: DEPOSIT_STATES }).notNull().default('none')),
  depositIntentId: col.internal(text('deposit_intent_id')),
  currency: col.currency('currency').notNull(),
  sourceRef: col.internal(text('source_ref')),
  cancelReason: col.internal(text('cancel_reason')),
  createdBy: col.account('created_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpe',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('companies_engagements_production').on(t.productionId).where(sql`production_id IS NOT NULL AND state <> 'cancelled'`),
    uniqueIndex('companies_engagements_source').on(t.sourceRef).where(sql`source_ref IS NOT NULL`),
    index('companies_engagements_company').on(t.companyId, t.state),
    index('companies_engagements_season').on(t.seasonId),
    oneOf('companies_engagements_kind', t.kind, ENGAGEMENT_KINDS),
    oneOf('companies_engagements_state', t.state, ENGAGEMENT_STATES),
    oneOf('companies_engagements_deposit_state', t.depositState, DEPOSIT_STATES),
    check('companies_engagements_title', sql`length(${t.title}) BETWEEN 1 AND 160`),
    atMost('companies_engagements_tech_notes', t.techNotes, 8000),
    atMost('companies_engagements_arrival_notes', t.arrivalNotes, 2000),
    check('companies_engagements_deposit', sql`${t.depositMinor} >= 0`),
    check('companies_engagements_cancelled', sql`(${t.state} = 'cancelled') = (${t.cancelReason} IS NOT NULL)`),
    atMost('companies_engagements_cancel_reason', t.cancelReason, 500),
  ],
})

/** An engagement's history: one row per move, agreement, allocation or settlement step. Ids and figures only (0011). */
export const engagementEvents = defineTable('companies_engagement_events', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  kind: col.internal(text('kind', { enum: ENGAGEMENT_EVENT_KINDS }).notNull()),
  fromState: col.internal(text('from_state')),
  toState: col.internal(text('to_state')),
  detail: col.internal(text('detail', { mode: 'json' }).$type<Record<string, string | number | boolean | null>>()),
  actorId: col.account('actor_id', { role: 'actor', nullable: true }),
  at: col.timestamp('at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'cpev',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('companies_engagement_events_engagement').on(t.engagementId, t.at),
    oneOf('companies_engagement_events_kind', t.kind, ENGAGEMENT_EVENT_KINDS),
  ],
})

/** One version of an engagement's terms. Only its state and when it was sent ever change (A1). */
export const agreements = defineTable('companies_agreements', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  version: col.internal(integer('version').notNull()),
  supersedesId: col.internal(text('supersedes_id')),
  dealType: col.internal(text('deal_type', { enum: DEAL_TYPES }).notNull()),
  companyShareBp: col.internal(integer('company_share_bp')),
  shareBasis: col.internal(text('share_basis', { enum: SHARE_BASES })),
  guaranteeMinor: col.minor('guarantee_minor'),
  hireFeeMinor: col.minor('hire_fee_minor'),
  hireFeeBasis: col.internal(text('hire_fee_basis', { enum: HIRE_FEE_BASES })),
  depositMinor: col.minor('deposit_minor').notNull().default(0),
  guestPlaces: col.internal(integer('guest_places').notNull().default(0)),
  guestNamesDue: col.internal(text('guest_names_due').notNull()),
  settleWithin: col.internal(text('settle_within').notNull()),
  clauses: col.internal(text('clauses')),
  fileId: col.internal(text('file_id')),
  state: col.internal(text('state', { enum: AGREEMENT_STATES }).notNull().default('draft')),
  sentAt: col.timestamp('sent_at'),
  createdBy: col.account('created_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'cpa',
  realm: 'operational',
  subject: 'none',
  appendOnly: { except: ['state', 'sent_at'] },
  extra: t => [
    uniqueIndex('companies_agreements_version').on(t.engagementId, t.version),
    oneOf('companies_agreements_deal_type', t.dealType, DEAL_TYPES),
    oneOf('companies_agreements_state', t.state, AGREEMENT_STATES),
    check('companies_agreements_version_from_one', sql`${t.version} >= 1`),
    check('companies_agreements_share', sql`${t.companyShareBp} IS NULL OR ${t.companyShareBp} BETWEEN 0 AND 10000`),
    check('companies_agreements_money', sql`coalesce(${t.guaranteeMinor}, 0) >= 0 AND coalesce(${t.hireFeeMinor}, 0) >= 0 AND ${t.depositMinor} >= 0`),
    check('companies_agreements_places', sql`${t.guestPlaces} BETWEEN 0 AND 50`),
    atMost('companies_agreements_clauses', t.clauses, 20000),
  ],
})

/** A contact accepting or declining a sent version, once (A3). */
export const agreementResponses = defineTable('companies_agreement_responses', {
  id: col.id(),
  agreementId: col.ref('companies_agreements'),
  answer: col.internal(text('answer', { enum: ANSWERS }).notNull()),
  responderId: col.account('responder_id', { role: 'subject' }),
  onBehalfOf: col.internal(text('on_behalf_of')),
  recordedBy: col.account('recorded_by', { role: 'actor', nullable: true }),
  at: col.timestamp('at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'cpar',
  realm: 'operational',
  appendOnly: true,
  extra: t => [
    uniqueIndex('companies_agreement_responses_once').on(t.agreementId),
    oneOf('companies_agreement_responses_answer', t.answer, ANSWERS),
  ],
})

/** A get-in, technical, dress, get-out or other call (D1, D2). */
export const calls = defineTable('companies_calls', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  kind: col.internal(text('kind', { enum: CALL_KINDS }).notNull()),
  spaceId: col.internal(text('space_id')),
  startsAt: col.timestamp('starts_at').notNull(),
  endsAt: col.timestamp('ends_at').notNull(),
  label: col.internal(text('label')),
  notes: col.internal(text('notes')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpca',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('companies_calls_engagement').on(t.engagementId, t.startsAt),
    oneOf('companies_calls_kind', t.kind, CALL_KINDS),
    check('companies_calls_times', sql`${t.endsAt} > ${t.startsAt}`),
    check('companies_calls_label', sql`(${t.kind} <> 'other' OR ${t.label} IS NOT NULL) AND (${t.label} IS NULL OR length(${t.label}) <= 80)`),
    atMost('companies_calls_notes', t.notes, 1000),
  ],
})

/** A person from the company in the building (D3). */
export const people = defineTable('companies_people', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  accountId: col.account('account_id', { role: 'subject', nullable: true }),
  name: col.personal(text('name').notNull()),
  role: col.internal(text('role')),
  under18: col.personal(integer('under_18', { mode: 'boolean' }).default(false), { erase: 'clear' }),
  addedBy: col.account('added_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpp',
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  retention: 'companies.people.keep-for',
  extra: t => [
    index('companies_people_engagement').on(t.engagementId),
    check('companies_people_name', sql`length(${t.name}) BETWEEN 1 AND 120`),
    atMost('companies_people_role', t.role, 80),
  ],
})

/** Guest places for one performance, held in Box office while unnamed (L1). */
export const allocations = defineTable('companies_allocations', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  performanceId: col.internal(text('performance_id').notNull()),
  places: col.internal(integer('places').notNull()),
  named: col.internal(integer('named').notNull().default(0)),
  holdRef: col.internal(text('hold_ref')),
  namesDueAt: col.timestamp('names_due_at').notNull(),
  state: col.internal(text('state', { enum: ALLOCATION_STATES }).notNull().default('open')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpg',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('companies_allocations_performance').on(t.engagementId, t.performanceId),
    oneOf('companies_allocations_state', t.state, ALLOCATION_STATES),
    check('companies_allocations_places', sql`${t.places} BETWEEN 0 AND 50 AND ${t.named} BETWEEN 0 AND ${t.places}`),
  ],
})

/** One named guest, issued a complimentary ticket through Box office (L2). */
export const guests = defineTable('companies_guests', {
  id: col.id(),
  allocationId: col.ref('companies_allocations'),
  accountId: col.account('account_id', { role: 'subject' }),
  places: col.internal(integer('places').notNull().default(1)),
  orderRef: col.internal(text('order_ref')),
  state: col.internal(text('state', { enum: GUEST_STATES }).notNull().default('named')),
  namedBy: col.account('named_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpgu',
  realm: 'audience',
  extra: t => [
    index('companies_guests_allocation').on(t.allocationId, t.state),
    index('companies_guests_account').on(t.accountId),
    oneOf('companies_guests_state', t.state, GUEST_STATES),
    check('companies_guests_places', sql`${t.places} BETWEEN 1 AND 50`),
  ],
})

/** One version of a settlement. Its figures are frozen once it leaves draft (S5); a change is a new version. */
export const settlements = defineTable('companies_settlements', {
  id: col.id(),
  engagementId: col.ref('companies_engagements'),
  version: col.internal(integer('version').notNull()),
  supersedesId: col.internal(text('supersedes_id')),
  agreementId: col.ref('companies_agreements', { nullable: true }),
  statementAsOf: col.timestamp('statement_as_of').notNull(),
  grossMinor: col.minor('gross_minor').notNull().default(0),
  feesMinor: col.minor('fees_minor').notNull().default(0),
  refundsMinor: col.minor('refunds_minor').notNull().default(0),
  basisMinor: col.minor('basis_minor').notNull().default(0),
  balanceMinor: col.minor('balance_minor').notNull(),
  currency: col.currency('currency').notNull(),
  state: col.internal(text('state', { enum: SETTLEMENT_STATES }).notNull().default('draft')),
  proposedAt: col.timestamp('proposed_at'),
  queryNote: col.freeText(text('query_note')),
  queriedBy: col.account('queried_by', { role: 'subject', nullable: true }),
  preparedBy: col.account('prepared_by', { role: 'actor', nullable: true }),
  approvedBy: col.account('approved_by', { role: 'actor', nullable: true }),
  agreedBy: col.account('agreed_by', { role: 'actor', nullable: true }),
  postingId: col.internal(text('posting_id')),
  invoiceRef: col.internal(text('invoice_ref')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cps',
  realm: 'operational',
  subject: { account: 'queried_by', unlinked: 'staff' },
  extra: t => [
    uniqueIndex('companies_settlements_version').on(t.engagementId, t.version),
    uniqueIndex('companies_settlements_current').on(t.engagementId).where(sql`state NOT IN ('superseded', 'void')`),
    oneOf('companies_settlements_state', t.state, SETTLEMENT_STATES),
    check('companies_settlements_two_people', sql`${t.approvedBy} IS NULL OR ${t.approvedBy} IS NOT ${t.preparedBy}`),
    atMost('companies_settlements_query', t.queryNote, 2000),
  ],
})

/** One line of a settlement; a note line is zero and never posts. */
export const settlementLines = defineTable('companies_settlement_lines', {
  id: col.id(),
  settlementId: col.ref('companies_settlements'),
  kind: col.internal(text('kind', { enum: LINE_KINDS }).notNull()),
  label: col.internal(text('label').notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  sourceRef: col.internal(text('source_ref')),
  posts: col.internal(integer('posts', { mode: 'boolean' }).notNull().default(true)),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'cpsl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('companies_settlement_lines_settlement').on(t.settlementId, t.sort),
    oneOf('companies_settlement_lines_kind', t.kind, LINE_KINDS),
    check('companies_settlement_lines_label', sql`length(${t.label}) BETWEEN 1 AND 120`),
    check('companies_settlement_lines_note', sql`(${t.kind} = 'note') = (${t.amountMinor} = 0) AND (${t.kind} <> 'note' OR ${t.posts} = 0)`),
  ],
})

/** Money recorded against a settlement while Invoices is off (M4). */
export const settlementPayments = defineTable('companies_settlement_payments', {
  id: col.id(),
  settlementId: col.ref('companies_settlements'),
  direction: col.internal(text('direction', { enum: PAYMENT_DIRECTIONS }).notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  method: col.internal(text('method', { enum: PAYMENT_METHODS }).notNull()),
  reference: col.internal(text('reference')),
  intentId: col.internal(text('intent_id')),
  postingId: col.internal(text('posting_id')),
  recordedBy: col.account('recorded_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'cpsp',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('companies_settlement_payments_settlement').on(t.settlementId),
    oneOf('companies_settlement_payments_direction', t.direction, PAYMENT_DIRECTIONS),
    oneOf('companies_settlement_payments_method', t.method, PAYMENT_METHODS),
    check('companies_settlement_payments_amount', sql`${t.amountMinor} > 0`),
    atMost('companies_settlement_payments_reference', t.reference, 80),
  ],
})

export const tables = {
  companies, contacts, engagements, engagementEvents, agreements, agreementResponses, calls, people,
  allocations, guests, settlements, settlementLines, settlementPayments,
}
