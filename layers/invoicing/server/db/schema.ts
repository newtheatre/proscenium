// Invoices and exports (third round, spec 9), part 2. Invoices and credit notes out (and later bills
// in) with their series, parties, lines and allocations; then the exports: a profile says how a file
// is laid out and which code each ledger account goes out under, and every file taken is a run.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import type { ExportColumn } from '../../shared/exports'

/** How a file is laid out: format, granularity, dates, signs and the total line. */
export const exportProfiles = defineTable('invoicing_export_profiles', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  format: col.internal(text('format', { enum: ['journal', 'xero', 'quickbooks', 'sage', 'freeagent', 'custom'] }).notNull()),
  granularity: col.internal(text('granularity', { enum: ['entry', 'daily'] }).notNull()),
  columns: col.internal(text('columns', { mode: 'json' }).$type<ExportColumn[]>().notNull().default(sql`'[]'`)),
  dateFormat: col.internal(text('date_format', { enum: ['iso', 'dmy', 'mdy'] }).notNull()),
  signs: col.internal(text('signs', { enum: ['split', 'signed', 'credit'] }).notNull()),
  splitBy: col.internal(text('split_by', { enum: ['none', 'production', 'source-module'] }).notNull()),
  // none, net (every money account), or one money account's Finance code.
  totalLine: col.internal(text('total_line').notNull().default('none')),
  totalLabel: col.internal(text('total_label').notNull().default('')),
  // Finance's tax code to the other books' name for it (rule E-16).
  taxMap: col.internal(text('tax_map', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`)),
  // What the kind label column says for a posting kind, or a kind and module or account.
  kindLabels: col.internal(text('kind_labels', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`)),
  unmappedCode: col.internal(text('unmapped_code').notNull().default('UNMAPPED')),
  periodRule: col.internal(text('period_rule', { enum: ['custom', 'period', 'finance-year', 'season'] }).notNull()),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ivx',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('invoicing_export_profiles_name').on(t.name),
    check('invoicing_export_profiles_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('invoicing_export_profiles_format', sql`${t.format} IN ('journal', 'xero', 'quickbooks', 'sage', 'freeagent', 'custom')`),
    check('invoicing_export_profiles_granularity', sql`${t.granularity} IN ('entry', 'daily')`),
    check('invoicing_export_profiles_date_format', sql`${t.dateFormat} IN ('iso', 'dmy', 'mdy')`),
    check('invoicing_export_profiles_signs', sql`${t.signs} IN ('split', 'signed', 'credit')`),
    check('invoicing_export_profiles_split_by', sql`${t.splitBy} IN ('none', 'production', 'source-module')`),
    check('invoicing_export_profiles_period_rule', sql`${t.periodRule} IN ('custom', 'period', 'finance-year', 'season')`),
    check('invoicing_export_profiles_unmapped', sql`length(${t.unmappedCode}) BETWEEN 1 AND 20`),
  ],
})

/** The other books' code for a ledger account in one profile; with a posting kind, for that kind only (rule E-06). */
export const exportCodes = defineTable('invoicing_export_codes', {
  id: col.id(),
  profileId: col.ref('invoicing_export_profiles'),
  accountId: col.ref('finance_accounts'),
  postingKind: col.internal(text('posting_kind')),
  // Null is explicitly unmapped.
  code: col.internal(text('code')),
  codeName: col.internal(text('code_name').notNull().default('')),
  updatedBy: col.account('updated_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  updatedAt: col.updatedAt(),
}, {
  id: 'ivm',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('invoicing_export_codes_account').on(t.profileId, t.accountId, sql`coalesce(${t.postingKind}, '')`),
    check('invoicing_export_codes_code', sql`${t.code} IS NULL OR length(${t.code}) BETWEEN 1 AND 50`),
    check('invoicing_export_codes_name', sql`length(${t.codeName}) <= 80`),
  ],
})

/** Every file taken, with its fingerprint, so taking a closed range again can be shown to give the same file (rule E-09). */
export const exportRuns = defineTable('invoicing_export_runs', {
  id: col.id(),
  profileId: col.ref('invoicing_export_profiles'),
  fromOn: col.localDate('from_on').notNull(),
  toOn: col.localDate('to_on').notNull(),
  // Ledger lines, before any total line.
  rows: col.internal(integer('rows').notNull()),
  unmappedRows: col.internal(integer('unmapped_rows').notNull()),
  // Every day of the range lay in a period closed at the time.
  closed: col.internal(integer('closed', { mode: 'boolean' }).notNull()),
  mapVersion: col.internal(text('map_version').notNull()),
  sha256: col.internal(text('sha256').notNull()),
  fileId: col.ref('core_files', { nullable: true }),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'ivr',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('invoicing_export_runs_profile').on(t.profileId, t.createdAt),
    check('invoicing_export_runs_order', sql`${t.toOn} >= ${t.fromOn}`),
  ],
})

export const INVOICE_STATES = ['draft', 'submitted', 'open', 'closed'] as const
export const ALLOCATION_KINDS = ['payment', 'credit', 'write_off', 'reversal'] as const

// An issued invoice is a legal record: the party's details stay for invoicing.records.keep-for.
const legal = { erase: 'retain', until: 'invoicing.records.keep-for', reason: 'invoicing.erasure.legal-record' } as const

/** A numbering series: "INV-" padded to 4 gives INV-0042. Numbers are taken only at issue (rule I-12). */
export const series = defineTable('invoicing_series', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  kind: col.internal(text('kind', { enum: ['invoice', 'credit_note'] }).notNull()),
  prefix: col.internal(text('prefix').notNull().default('')),
  pad: col.internal(integer('pad').notNull().default(4)),
  nextNumber: col.internal(integer('next_number').notNull().default(1)),
  isDefault: col.internal(integer('is_default', { mode: 'boolean' }).notNull().default(false)),
  archivedAt: col.timestamp('archived_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ivs',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('invoicing_series_default').on(t.kind).where(sql`is_default = 1`),
    check('invoicing_series_name', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('invoicing_series_kind', sql`${t.kind} IN ('invoice', 'credit_note')`),
    check('invoicing_series_prefix', sql`length(${t.prefix}) <= 12 AND ${t.prefix} NOT GLOB '*[^A-Za-z0-9/-]*'`),
    check('invoicing_series_pad', sql`${t.pad} BETWEEN 1 AND 8`),
    check('invoicing_series_next', sql`${t.nextNumber} >= 1`),
  ],
})

/** Who is invoiced or bills us, and their standing terms: a company, or a person's account. */
export const parties = defineTable('invoicing_parties', {
  id: col.id(),
  partyModule: col.internal(text('party_module', { enum: ['companies', 'core'] }).notNull()),
  partyId: col.internal(text('party_id').notNull()),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'The party is the person, whichever account survives', nullable: true }),
  termsDays: col.internal(integer('terms_days')),
  standingReference: col.internal(text('standing_reference').notNull().default('')),
  defaultAccountId: col.ref('finance_accounts', { nullable: true }),
  defaultTaxCode: col.internal(text('default_tax_code')),
  sendReminders: col.internal(integer('send_reminders', { mode: 'boolean' }).notNull().default(true)),
  // The postal address printed for a person party; a company keeps its own.
  address: col.personal(text('address').notNull().default(''), { erase: 'clear' }),
  note: col.freeText(text('note').notNull().default('')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ivp',
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  extra: t => [
    uniqueIndex('invoicing_parties_party').on(t.partyModule, t.partyId),
    index('invoicing_parties_account').on(t.accountId),
    check('invoicing_parties_module', sql`${t.partyModule} IN ('companies', 'core')`),
    check('invoicing_parties_terms', sql`${t.termsDays} IS NULL OR ${t.termsDays} BETWEEN 0 AND 120`),
    check('invoicing_parties_reference', sql`length(${t.standingReference}) <= 60`),
    check('invoicing_parties_address', sql`length(${t.address}) <= 400`),
    check('invoicing_parties_note', sql`length(${t.note}) <= 500`),
  ],
})

/** An invoice or credit note out, or a supplier's bill in. Its document columns are fixed once out of draft (I-14). */
export const invoices = defineTable('invoicing_invoices', {
  id: col.id(),
  direction: col.internal(text('direction', { enum: ['out', 'in'] }).notNull()),
  kind: col.internal(text('kind', { enum: ['invoice', 'credit_note'] }).notNull()),
  creditsId: col.internal(text('credits_id')),
  seriesId: col.ref('invoicing_series', { nullable: true }),
  number: col.internal(text('number')),
  partyModule: col.internal(text('party_module')),
  partyId: col.internal(text('party_id')),
  partyAccountId: col.account('party_account_id', { role: 'subject', onMerge: 'move', reason: 'The party is the person, whichever account survives', nullable: true }),
  billToName: col.personal(text('bill_to_name').notNull(), legal),
  billToAddress: col.personal(text('bill_to_address').notNull().default(''), legal),
  billToEmail: col.email('bill_to_email', legal),
  taxNumber: col.internal(text('tax_number').notNull().default('')),
  sellerTaxNumber: col.internal(text('seller_tax_number')),
  reference: col.internal(text('reference').notNull().default('')),
  issueOn: col.localDate('issue_on'),
  dueOn: col.localDate('due_on'),
  suppliedOn: col.localDate('supplied_on'),
  currency: col.currency('currency').notNull(),
  netMinor: col.minor('net_minor').notNull().default(0),
  taxMinor: col.minor('tax_minor').notNull().default(0),
  totalMinor: col.minor('total_minor').notNull().default(0),
  allocatedMinor: col.minor('allocated_minor').notNull().default(0),
  state: col.internal(text('state', { enum: INVOICE_STATES }).notNull().default('draft')),
  notes: col.freeText(text('notes').notNull().default('')),
  internalNote: col.freeText(text('internal_note').notNull().default('')),
  // Why an approver sent a bill back, for whoever logged it; cleared when it is submitted again.
  returnedNote: col.freeText(text('returned_note').notNull().default('')),
  sourceModule: col.internal(text('source_module')),
  sourceType: col.internal(text('source_type')),
  sourceId: col.internal(text('source_id')),
  ownerModule: col.internal(text('owner_module')),
  pdfFileId: col.ref('core_files', { nullable: true }),
  postingId: col.internal(text('posting_id')),
  payTokenHash: col.internal(text('pay_token_hash')),
  payTokenExpiresAt: col.timestamp('pay_token_expires_at'),
  remindersOn: col.internal(integer('reminders_on', { mode: 'boolean' }).notNull().default(true)),
  // Raised by every change to a draft and by issue, so a stale screen cannot overwrite a newer one.
  version: col.internal(integer('version').notNull().default(0)),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  issuedBy: col.account('issued_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  issuedAt: col.timestamp('issued_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ivc',
  realm: 'operational',
  subject: { account: 'party_account_id', unlinked: 'staff' },
  retention: 'invoicing.records.keep-for',
  extra: t => [
    uniqueIndex('invoicing_invoices_number').on(t.direction, t.number).where(sql`direction = 'out' AND number IS NOT NULL`),
    uniqueIndex('invoicing_invoices_supplier_number').on(t.partyModule, t.partyId, t.number).where(sql`direction = 'in' AND number IS NOT NULL`),
    uniqueIndex('invoicing_invoices_posting').on(t.postingId).where(sql`posting_id IS NOT NULL`),
    index('invoicing_invoices_state').on(t.state, t.dueOn),
    index('invoicing_invoices_source').on(t.sourceModule, t.sourceType, t.sourceId),
    index('invoicing_invoices_party').on(t.partyModule, t.partyId),
    index('invoicing_invoices_credits').on(t.creditsId),
    check('invoicing_invoices_direction', sql`${t.direction} IN ('out', 'in')`),
    check('invoicing_invoices_kind', sql`${t.kind} IN ('invoice', 'credit_note')`),
    check('invoicing_invoices_credits_kind', sql`(${t.kind} = 'credit_note') = (${t.creditsId} IS NOT NULL)`),
    check('invoicing_invoices_series_out', sql`${t.direction} = 'in' OR ${t.seriesId} IS NOT NULL`),
    check('invoicing_invoices_state', sql`${t.state} IN ('draft', 'submitted', 'open', 'closed')`),
    check('invoicing_invoices_issued', sql`${t.state} IN ('draft', 'submitted') OR (${t.number} IS NOT NULL AND ${t.issueOn} IS NOT NULL AND ${t.dueOn} IS NOT NULL AND ${t.postingId} IS NOT NULL)`),
    check('invoicing_invoices_due', sql`${t.dueOn} IS NULL OR ${t.issueOn} IS NULL OR ${t.dueOn} >= ${t.issueOn}`),
    check('invoicing_invoices_party_pair', sql`(${t.partyModule} IS NULL) = (${t.partyId} IS NULL)`),
    check('invoicing_invoices_name', sql`length(${t.billToName}) BETWEEN 1 AND 120`),
    check('invoicing_invoices_address', sql`length(${t.billToAddress}) <= 400`),
    check('invoicing_invoices_tax_number', sql`length(${t.taxNumber}) <= 30`),
    check('invoicing_invoices_reference', sql`length(${t.reference}) <= 60`),
    check('invoicing_invoices_notes', sql`length(${t.notes}) <= 1000 AND length(${t.internalNote}) <= 1000`),
    check('invoicing_invoices_returned', sql`length(${t.returnedNote}) <= 500`),
    check('invoicing_invoices_amounts', sql`${t.netMinor} >= 0 AND ${t.taxMinor} >= 0 AND ${t.totalMinor} = ${t.netMinor} + ${t.taxMinor}`),
    check('invoicing_invoices_allocated', sql`${t.allocatedMinor} BETWEEN 0 AND ${t.totalMinor}`),
    check('invoicing_invoices_source_set', sql`(${t.sourceModule} IS NULL) = (${t.sourceId} IS NULL) AND (${t.sourceType} IS NULL) = (${t.sourceId} IS NULL)`),
  ],
})

/** One line of an invoice: quantity in thousandths, unit price, net, VAT at its code's rate (I-05, I-42). */
export const lines = defineTable('invoicing_lines', {
  id: col.id(),
  invoiceId: col.ref('invoicing_invoices'),
  position: col.internal(integer('position').notNull()),
  description: col.freeText(text('description').notNull()),
  quantityMilli: col.internal(integer('quantity_milli').notNull()),
  unitMinor: col.minor('unit_minor').notNull(),
  netMinor: col.minor('net_minor').notNull(),
  taxCode: col.internal(text('tax_code').notNull().default('none')),
  taxMinor: col.minor('tax_minor').notNull().default(0),
  taxRateBp: col.internal(integer('tax_rate_bp').notNull().default(0)),
  accountId: col.ref('finance_accounts', { nullable: true }),
  ownerKey: col.internal(text('owner_key')),
  productionId: col.internal(text('production_id')),
  performanceId: col.internal(text('performance_id')),
  budgetLineId: col.internal(text('budget_line_id')),
  budgetRequestId: col.internal(text('budget_request_id')),
  createdAt: col.createdAt(),
}, {
  id: 'ivl',
  realm: 'operational',
  subject: { via: 'invoice_id' },
  extra: t => [
    uniqueIndex('invoicing_lines_position').on(t.invoiceId, t.position),
    check('invoicing_lines_description', sql`length(${t.description}) BETWEEN 1 AND 300`),
    check('invoicing_lines_quantity', sql`${t.quantityMilli} BETWEEN 1 AND 1000000000`),
    check('invoicing_lines_amounts', sql`${t.unitMinor} >= 0 AND ${t.netMinor} >= 0 AND ${t.taxMinor} >= 0`),
    check('invoicing_lines_none', sql`${t.taxCode} <> 'none' OR ${t.taxMinor} = 0`),
    check('invoicing_lines_rate', sql`${t.taxRateBp} BETWEEN 0 AND 10000`),
    check('invoicing_lines_account', sql`${t.ownerKey} IS NOT NULL OR ${t.accountId} IS NOT NULL`),
  ],
})

/** Money against an invoice: a payment, a credit note, a write-off, or the reversal of one (I-20 to I-25). Never edited. */
export const allocations = defineTable('invoicing_allocations', {
  id: col.id(),
  invoiceId: col.ref('invoicing_invoices'),
  kind: col.internal(text('kind', { enum: ALLOCATION_KINDS }).notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  reversesId: col.internal(text('reverses_id')),
  intentId: col.internal(text('intent_id')),
  disbursementId: col.internal(text('disbursement_id')),
  creditNoteId: col.internal(text('credit_note_id')),
  postingId: col.internal(text('posting_id')),
  onDate: col.localDate('on_date').notNull(),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'iva',
  realm: 'operational',
  subject: { via: 'invoice_id' },
  appendOnly: true,
  extra: t => [
    index('invoicing_allocations_invoice').on(t.invoiceId, t.createdAt),
    index('invoicing_allocations_reverses').on(t.reversesId),
    check('invoicing_allocations_kind', sql`${t.kind} IN ('payment', 'credit', 'write_off', 'reversal')`),
    check('invoicing_allocations_amount', sql`${t.amountMinor} <> 0 AND (${t.amountMinor} > 0) = (${t.kind} <> 'reversal')`),
    check('invoicing_allocations_one_source', sql`(${t.intentId} IS NOT NULL) + (${t.disbursementId} IS NOT NULL) + (${t.creditNoteId} IS NOT NULL) + (${t.postingId} IS NOT NULL) + (${t.reversesId} IS NOT NULL) = 1`),
  ],
})

export const REMINDER_STEPS = ['sent', 'before-due', 'overdue-1', 'overdue-2', 'manual'] as const

/** Each time an invoice out was emailed: when issued, each reminder step once, and any sent by hand (I-17, I-31, I-35). */
export const reminders = defineTable('invoicing_reminders', {
  id: col.id(),
  invoiceId: col.ref('invoicing_invoices'),
  step: col.internal(text('step', { enum: REMINDER_STEPS }).notNull()),
  notificationId: col.internal(text('notification_id').notNull()),
  sentBy: col.account('sent_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'ivn',
  realm: 'operational',
  subject: { via: 'invoice_id' },
  appendOnly: true,
  extra: t => [
    index('invoicing_reminders_invoice').on(t.invoiceId, t.createdAt),
    uniqueIndex('invoicing_reminders_step').on(t.invoiceId, t.step).where(sql`step IN ('sent', 'before-due', 'overdue-1', 'overdue-2')`),
    check('invoicing_reminders_steps', sql`${t.step} IN ('sent', 'before-due', 'overdue-1', 'overdue-2', 'manual')`),
  ],
})

export const tables = { series, parties, invoices, lines, allocations, reminders, exportProfiles, exportCodes, exportRuns }
