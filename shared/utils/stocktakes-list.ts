import { STOCKTAKE_STATUSES, saysStocktakeStatus } from './stocktakes'
import type { ListSpec } from './list-filters'

// The stocktake history's declaration (K-129, F-115). The status column is the only text there
// is to search, so that is what the toolbar box runs over.
export const stocktakesList = {
  key: 'bar-stocktakes',
  search: { placeholder: 'Open or applied', maxLength: 10 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: STOCKTAKE_STATUSES.map(status => ({ value: status, label: saysStocktakeStatus(status) })),
      // The column is never null, so "is empty" would always answer nothing.
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-clipboard-list',
    },
  ],
  sort: {
    fields: [{ key: 'openedAt', label: 'Opened', column: 'opened_at' }],
    default: 'openedAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
