import { MAX_BAR_NAME } from './bar'
import type { ListSpec } from './list-filters'

// The stocked items' declaration (K-129, F-114). Retired is status, not a column of its own.
export const barItemsList = {
  key: 'bar-items',
  search: { placeholder: 'A stocked item', maxLength: MAX_BAR_NAME },
  fields: [
    { key: 'retired', label: 'Retired', kind: 'yes-no' },
    {
      key: 'allergenState',
      label: 'Allergens',
      kind: 'list',
      column: 'allergen_state',
      operators: ['is', 'not', 'any'],
      options: [
        { value: 'UNKNOWN', label: 'No information recorded' },
        { value: 'NONE', label: 'Confirmed no allergens' },
        { value: 'RECORDED', label: 'Allergens recorded' },
      ],
      icon: 'i-lucide-wheat',
    },
  ],
  sort: {
    fields: [
      { key: 'status', label: 'Status', column: 'status' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
      // Unanswered first, which is the order the allergen review works through (issue 1348).
      { key: 'allergens', label: 'Allergens, unanswered first', column: 'allergen_order' },
    ],
    default: 'status',
  },
} as const satisfies ListSpec
