import { ENTRY_SOURCES, LINE_KINDS, TENDERS, describeKind, saysEntrySource, saysTender } from './ledger'
import { plural } from './text'
import { saysDay } from './when'
import type { EntrySource, LineKind, Tender } from './ledger'
import type { FilterCondition, ListSpec } from './list-filters'

// The ledger entries list's declaration (K-129, I-105 criterion 3): a treasurer drills down from
// the money dashboard by day, source, tender or what was sold, never by editing a query string.
export const ledgerEntriesList = {
  key: 'ledger-entries',
  fields: [
    { key: 'happenedAt', label: 'When', kind: 'date-range', column: 'happened_at', dateAs: 'unix', icon: 'i-lucide-calendar' },
    {
      key: 'source',
      label: 'Source',
      kind: 'list',
      column: 'source',
      options: ENTRY_SOURCES.map(source => ({ value: source, label: saysEntrySource(source) })),
      operators: ['is', 'any'],
      icon: 'i-lucide-map-pin',
    },
    {
      key: 'tender',
      label: 'Tender',
      kind: 'list',
      column: 'tender',
      options: TENDERS.map(tender => ({ value: tender, label: saysTender(tender) })),
      operators: ['is', 'any'],
      icon: 'i-lucide-credit-card',
    },
    // What the entry's lines were: answered over the lines, since an entry can hold more than one.
    {
      key: 'kind',
      label: 'What',
      kind: 'list',
      options: LINE_KINDS.map(kind => ({ value: kind.name, label: kind.label })),
      operators: ['is', 'not', 'any'],
      cap: LINE_KINDS.length,
      icon: 'i-lucide-tag',
    },
    { key: 'discounted', label: 'Discounted', kind: 'yes-no', negated: 'Not discounted', icon: 'i-lucide-percent' },
  ],
  sort: {
    fields: [{ key: 'happenedAt', label: 'When', column: 'happened_at' }],
    default: 'happenedAt',
    direction: 'desc',
  },
  search: { placeholder: 'A booking reference or a show' },
} as const satisfies ListSpec

export interface LedgerEntryRow {
  id: string
  happenedAt: number
  source: EntrySource
  tender: Tender
  totalPence: number
  // The distinct kinds of its lines, comma-separated, or null for an entry with none.
  kinds: string | null
  items: number
  showTitle: string | null
  reference: string | null
}

// One entry as its panel opens it: the people on it, named, and every line (issue 1361).
export interface LedgerEntryDetail {
  id: string
  happenedAt: number
  source: EntrySource
  tender: Tender
  totalPence: number
  takenBy: string | null
  compReason: string | null
  compApprovedBy: string | null
  tabDebtor: string | null
  voidReason: string | null
  voidOfEntryId: string | null
  reversesEntryId: string | null
}

// A discount is snapshotted on its line, never on the entry (F-117), so a line carries its own.
export interface LedgerEntryLine {
  id: string
  kind: string
  qty: number
  unitPricePence: number | null
  amountPence: number
  discountPence: number | null
  discountPercent: number | null
  showTitle: string | null
  startsAt: number | null
  reference: string | null
}

export type LedgerEntryOpened = LedgerEntryDetail & { lines: LedgerEntryLine[] }

const KIND_ORDER = LINE_KINDS.map(kind => kind.name as string)

// "Ticket collection (2 items), Hamlet": what a treasurer would say the entry was.
export function saysEntryWhat(entry: Pick<LedgerEntryRow, 'kinds' | 'items' | 'showTitle'>): string {
  const kinds = (entry.kinds ?? '').split(',').filter(Boolean)
    .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
    .map(describeKind)
  if (!kinds.length) return 'No lines'
  const named = kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`
  const counted = entry.items > 1 ? `${named} (${plural(entry.items, 'item')})` : named
  return entry.showTitle ? `${counted}, ${entry.showTitle}` : counted
}

export interface EntriesFilters {
  source?: EntrySource
  tender?: Tender
  kind?: LineKind
  discounted?: boolean
}

// A dashboard figure's own drill-down: its range as the When filter, and the filters its query
// uses, so the list adds up to the figure it came from (I-105 criterion 3).
export function entriesHref(range: { fromDay: string, toDay: string }, filters: EntriesFilters = {}): string {
  const params = new URLSearchParams({
    happenedAt: range.fromDay === range.toDay ? range.fromDay : `between:${range.fromDay},${range.toDay}`,
  })
  if (filters.source) params.set('source', filters.source)
  if (filters.tender) params.set('tender', filters.tender)
  if (filters.kind) params.set('kind', filters.kind)
  if (filters.discounted !== undefined) params.set('discounted', String(filters.discounted))
  return `/money/entries?${params.toString()}`
}

// The list always carries a day (I-105 criterion 3), so the range alone is a quiet day; only a
// search or a filter beyond the range can be what matched nothing.
export function saysNoEntries(conditions: readonly FilterCondition[], searched: boolean): string {
  if (searched || conditions.some(one => one.key !== 'happenedAt')) return 'No entry matches that.'
  const range = conditions.find(one => one.key === 'happenedAt')
  if (!range) return 'Nothing has been posted to the ledger yet.'
  const [from, to] = range.values.map(day => saysDay(day))
  if (range.operator === 'between') return `Nothing was posted to the ledger between ${from} and ${to}.`
  if (range.operator === 'before' || range.operator === 'after') return `Nothing was posted to the ledger ${range.operator} ${from}.`
  return `Nothing was posted to the ledger on ${from}.`
}
