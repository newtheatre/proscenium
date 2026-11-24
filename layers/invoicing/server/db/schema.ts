// Invoices and exports (third round, spec 9), part 2. The gate builds the exports half: a profile says
// how a file is laid out and which code each ledger account goes out under, and every file taken is
// recorded as a run with its fingerprint. Invoices, bills and schedules add their tables with their stories.
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

export const tables = { exportProfiles, exportCodes, exportRuns }
