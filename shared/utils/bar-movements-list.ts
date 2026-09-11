import { STOCK_MOVEMENT_KINDS, says } from './bar'
import type { ListSpec } from './list-filters'

// The movement history's declaration (K-129, F-114). `recordedOrder` breaks a tie within the
// same second on `rowid`, insertion order; `id` is a random UUID and no guide to which came later.
export const barMovementsList = {
  key: 'bar-movements',
  search: { placeholder: 'A stocked item', maxLength: 80 },
  fields: [
    {
      key: 'itemId',
      label: 'Stocked item',
      kind: 'search-list',
      column: 'item_id',
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-package',
    },
    {
      key: 'kind',
      label: 'What happened',
      kind: 'list',
      column: 'kind',
      options: STOCK_MOVEMENT_KINDS.map(value => ({ value, label: says(value) })),
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-arrow-left-right',
    },
  ],
  sort: {
    fields: [
      { key: 'when', label: 'When', column: 'created_at' },
      { key: 'recordedOrder', label: 'Recorded order', column: 'rowid' },
    ],
    default: 'when',
    direction: 'desc',
  },
} as const satisfies ListSpec
