import { ENTRY_SOURCES, TENDERS, saysEntrySource, saysTender } from './ledger'
import type { ListSpec } from './list-filters'

// The ledger entries list's declaration (K-129, I-105 criterion 3): a treasurer drills down from
// the season dashboard by day, source or tender, never by editing a query string by hand.
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
  ],
  sort: {
    fields: [{ key: 'happenedAt', label: 'When', column: 'happened_at' }],
    default: 'happenedAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
