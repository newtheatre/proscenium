import { MAX_VENUE_NAME } from './venues'
import type { ListSpec } from './list-filters'

// The venues list's declaration (K-129). A venue is retired, never destroyed (D-131 criterion 4),
// so "retired" is a filter like any other rather than the includeArchived flag it used to be.
export const venuesList = {
  key: 'venues',
  search: { placeholder: 'A venue', maxLength: MAX_VENUE_NAME },
  fields: [
    { key: 'archived', label: 'Retired', kind: 'yes-no', column: 'archived', negated: 'Hiding retired', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'name',
  },
} as const satisfies ListSpec
