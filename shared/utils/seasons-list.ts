import { MAX_SEASON_NAME } from './seasons'
import type { ListSpec } from './list-filters'

// The seasons list's declaration (K-129). A season keeps its own manual order (D-131); name is
// the tiebreak and the fallback for a reader who wants alphabetical instead.
export const seasonsList = {
  key: 'seasons',
  search: { placeholder: 'A season', maxLength: MAX_SEASON_NAME },
  fields: [
    { key: 'archived', label: 'Archived', kind: 'yes-no', column: 'archived', negated: 'Hiding archived seasons', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'sort', label: 'Order', column: 'sort' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'sort',
  },
} as const satisfies ListSpec
