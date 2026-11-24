// Export profiles (Invoices and exports, parts 2 and 4): the layouts a file can take, the columns a
// custom profile chooses from, and the two profiles the module starts from. Read by the server and
// by the profile screen, so both offer the same choices.
import { z } from 'zod'

/** Formats built so far. xero, quickbooks, sage and freeagent come with IE-21. */
export const FORMATS = ['journal', 'custom'] as const
export type ExportFormat = typeof FORMATS[number]
export const GRANULARITIES = ['entry', 'daily'] as const
export const DATE_FORMATS = ['iso', 'dmy', 'mdy'] as const
/** `credit` is one amount with credits positive, so income and sales read positive. */
export const SIGNS = ['split', 'signed', 'credit'] as const
export const SPLIT_BY = ['none', 'production', 'source-module'] as const
/** `season` waits for Seasons' dates to be readable by other modules. */
export const PERIOD_RULES = ['custom', 'period', 'finance-year'] as const

/** What a custom profile's columns may hold, in the order the screen offers them. */
export const COLUMN_KEYS = [
  'date', 'day', 'time', 'posting', 'kind', 'kind-label', 'account-code', 'code', 'code-name', 'account-name',
  'description', 'debit', 'credit', 'amount', 'amount-minor', 'currency', 'production', 'performance', 'source', 'money', 'reference',
] as const
export type ColumnKey = typeof COLUMN_KEYS[number]

/** Columns written as plain numbers, never guarded against formulas (rule E-10). */
export const AMOUNT_COLUMNS: readonly ColumnKey[] = ['debit', 'credit', 'amount', 'amount-minor']

export interface ExportColumn { key: ColumnKey, header: string }

const HEADER_MAX = 40 // not-policy: a spreadsheet heading's length
const COLUMNS_MAX = 30 // not-policy: more columns than the catalogue holds
const CODE_MAX = 50 // not-policy: the spec's bound on a code
const LABEL_MAX = 80 // not-policy: the spec's bound on a code's name

export const columnSchema = z.object({ key: z.enum(COLUMN_KEYS), header: z.string().trim().min(1).max(HEADER_MAX) }).strict()

/** Keys are a posting kind, or a kind and the module or account the posting is for: `sale`, `sale:bar`, `sale:box-office.pass-income`. */
export const kindLabelsSchema = z.record(z.string().regex(/^[a-z_]+(:[a-z0-9.-]+)?$/).max(80), z.string().trim().min(1).max(LABEL_MAX)) // not-policy: a key's length

export const profileFields = {
  name: z.string().trim().min(1).max(60), // not-policy: the spec's bound on a profile's name
  format: z.enum(FORMATS),
  granularity: z.enum(GRANULARITIES),
  columns: z.array(columnSchema).max(COLUMNS_MAX),
  dateFormat: z.enum(DATE_FORMATS),
  signs: z.enum(SIGNS),
  splitBy: z.enum(SPLIT_BY),
  // none, net (every money account), or one money account's Finance code.
  totalLine: z.string().trim().min(1).max(CODE_MAX),
  totalLabel: z.string().trim().max(LABEL_MAX),
  taxMap: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), z.string().trim().min(1).max(CODE_MAX)),
  kindLabels: kindLabelsSchema,
  unmappedCode: z.string().trim().min(1).max(20), // not-policy: the spec's bound on the unmapped code
  periodRule: z.enum(PERIOD_RULES),
}

/** Letters and digits, joined by dots, dashes or underscores: what ledger codes are, and what an audit row may carry. */
export const codeSchema = z.string().trim().min(1).max(CODE_MAX).regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/i)
export const codeNameSchema = z.string().trim().max(LABEL_MAX)

export interface ProfileLayout {
  format: ExportFormat
  granularity: typeof GRANULARITIES[number]
  columns: ExportColumn[]
  dateFormat: typeof DATE_FORMATS[number]
  signs: typeof SIGNS[number]
  splitBy: typeof SPLIT_BY[number]
  totalLine: string
  totalLabel: string
  taxMap: Record<string, string>
  kindLabels: Record<string, string>
  unmappedCode: string
  periodRule: typeof PERIOD_RULES[number]
}

/** The journal layout's columns (part 4); with one signed amount, Amount takes Debit and Credit's place. */
export function journalColumns(signs: ProfileLayout['signs']): ExportColumn[] {
  const amounts: ExportColumn[] = signs === 'split'
    ? [{ key: 'debit', header: 'Debit' }, { key: 'credit', header: 'Credit' }]
    : [{ key: 'amount', header: 'Amount' }]
  return [
    { key: 'date', header: 'Date' },
    { key: 'posting', header: 'Journal' },
    { key: 'code', header: 'Account code' },
    { key: 'code-name', header: 'Account name' },
    { key: 'description', header: 'Description' },
    ...amounts,
    { key: 'currency', header: 'Currency' },
    { key: 'production', header: 'Production' },
    { key: 'source', header: 'Source' },
  ]
}

export const STARTERS = ['journal', 'union'] as const
export type Starter = typeof STARTERS[number]

/** The old card-total line's wording (decision 0130 in the old system), now the union profile's total label. */
export const UNION_TOTAL_LABEL = 'Card total, the same as the money dashboard\'s revenue'

/**
 * The students' union return as old Proscenium made it (decision 0130, story I-108): its six leading
 * columns, under their old headings, never move; what traces a line follows. One row per entry,
 * credits positive so that sales read positive and refunds negative, and the money accounts' net last.
 */
export const UNION_PROFILE: { name: string } & ProfileLayout = {
  name: 'Students\' union return',
  format: 'custom',
  granularity: 'entry',
  columns: [
    { key: 'day', header: 'date' },
    { key: 'kind-label', header: 'category' },
    { key: 'money', header: 'tender' },
    { key: 'code', header: 'nominalCode' },
    { key: 'amount-minor', header: 'amountPence' },
    { key: 'amount', header: 'amountPounds' },
    { key: 'time', header: 'time' },
    { key: 'source', header: 'source' },
    { key: 'production', header: 'show' },
    { key: 'reference', header: 'reference' },
  ],
  dateFormat: 'iso',
  signs: 'credit',
  splitBy: 'none',
  totalLine: 'net',
  totalLabel: UNION_TOTAL_LABEL,
  taxMap: {},
  kindLabels: {
    'sale:box-office.pass-income': 'Pass sale',
    'sale:box-office': 'Ticket sale',
    'sale:bar': 'Bar item',
    'sale:membership-fees': 'Membership fee',
    'refund': 'Refund',
    'recognition': 'Ticket income recognised',
    'fee': 'Payment fee',
    'payout': 'Payout',
  },
  unmappedCode: 'UNMAPPED',
  periodRule: 'finance-year',
}

export const JOURNAL_PROFILE: { name: string } & ProfileLayout = {
  name: 'Journal',
  format: 'journal',
  granularity: 'entry',
  columns: [],
  dateFormat: 'iso',
  signs: 'split',
  splitBy: 'none',
  totalLine: 'none',
  totalLabel: '',
  taxMap: {},
  kindLabels: {},
  unmappedCode: 'UNMAPPED',
  periodRule: 'period',
}

export const STARTER_PROFILES: Record<Starter, { name: string } & ProfileLayout> = { journal: JOURNAL_PROFILE, union: UNION_PROFILE }
