// Finance's lists (Box office specification, part 5): what a person can filter, sort and search by.
// The sources in server/lists bind each key to the table.
import { defineList } from '#kit/list-declaration'

const KINDS = ['sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'] as const

/**
 * The ledger: sealed postings, newest first, each opening to its entries. Account, period and
 * production take the theatre's own values, which the page supplies. Search finds a posting by
 * an account's code or name, or by the reference of what it came from,
 * applied by the route.
 */
export const ledgerList = defineList('finance.ledger', {
  filters: {
    account: { kind: 'choice', label: 'Account' },
    period: { kind: 'choice', label: 'Period' },
    production: { kind: 'choice', label: 'Production' },
    kind: { kind: 'choices', label: 'Posting', options: KINDS.map(value => ({ value, label: value })) },
    occurred: { kind: 'dates', label: 'Date', presets: [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }] },
  },
  sorts: {
    occurred: { label: 'Date', type: 'date', natural: 'desc' },
  },
  columns: {
    kind: { label: 'Posting', always: true, card: true },
    occurred: { label: 'Date', sort: 'occurred', card: true },
    source: { label: 'From' },
    amount: { label: 'Amount', card: true },
  },
  views: {
    all: { label: 'All', open: true },
    sales: { label: 'Sales', filters: { kind: 'sale' }, open: true },
    refunds: { label: 'Refunds', filters: { kind: 'refund' }, open: true },
    corrections: { label: 'Corrections', filters: { kind: 'correction' }, open: true },
  },
  defaultView: 'all',
  defaultSort: { key: 'occurred', order: 'desc' },
})
