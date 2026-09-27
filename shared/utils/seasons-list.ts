import { MAX_SEASON_NAME } from './seasons'
import type { ListSpec } from './list-filters'

// The seasons list's declaration (K-129). Seasons list in date order (D-131 criterion 2); name
// is the other way to read them.
export const seasonsList = {
  key: 'seasons',
  search: { placeholder: 'A season', maxLength: MAX_SEASON_NAME },
  fields: [
    { key: 'archived', label: 'Archived', kind: 'yes-no', column: 'archived', negated: 'Hiding archived seasons', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'startsOn', label: 'Dates', column: 'starts_on' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'startsOn',
  },
} as const satisfies ListSpec
