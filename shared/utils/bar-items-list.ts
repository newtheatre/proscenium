import { MAX_BAR_NAME } from './bar'
import type { ListSpec } from './list-filters'

// The stocked items' declaration (K-129, F-114). Retired is status, not a column of its own.
export const barItemsList = {
  key: 'bar-items',
  search: { placeholder: 'A stocked item', maxLength: MAX_BAR_NAME },
  fields: [
    { key: 'retired', label: 'Retired', kind: 'yes-no' },
  ],
  sort: {
    fields: [
      { key: 'status', label: 'Status', column: 'status' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'status',
  },
} as const satisfies ListSpec
