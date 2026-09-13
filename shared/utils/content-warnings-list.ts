import { MAX_WARNING_TITLE } from './content-warnings'
import type { ListSpec } from './list-filters'

// The content warnings list's declaration (K-129). Search runs over title and slug (D-102);
// GENERAL warnings list first, fixed at the query, so only the tiebreak after is a declared sort.
export const contentWarningsList = {
  key: 'content-warnings',
  search: { placeholder: 'A warning', maxLength: MAX_WARNING_TITLE },
  fields: [
    { key: 'archived', label: 'Archived', kind: 'yes-no', column: 'archived', negated: 'Hiding archived warnings', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'sort', label: 'Order', column: 'sort' },
      { key: 'title', label: 'Title', column: 'title', collate: 'nocase' },
    ],
    default: 'sort',
  },
} as const satisfies ListSpec
