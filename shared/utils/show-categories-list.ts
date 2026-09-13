import { MAX_CATEGORY_NAME } from './show-categories'
import type { ListSpec } from './list-filters'

// The show categories list's declaration (K-129). A category keeps its own manual order (D-131);
// name is the tiebreak and the fallback for a reader who wants alphabetical instead.
export const showCategoriesList = {
  key: 'show-categories',
  search: { placeholder: 'A category', maxLength: MAX_CATEGORY_NAME },
  fields: [
    { key: 'archived', label: 'Archived', kind: 'yes-no', column: 'archived', negated: 'Hiding archived categories', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'sort', label: 'Order', column: 'sort' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'sort',
  },
} as const satisfies ListSpec
