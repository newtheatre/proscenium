import type { ListSpec } from './list-filters'

// The checklist-venues declaration (K-129, E-114). "Configured" is not a column: it asks
// whether the venue has any active item, answered from `checklist_items` at query time.
export const checklistVenuesList = {
  key: 'checklist-venues',
  search: { placeholder: 'A venue', maxLength: 120 },
  fields: [
    { key: 'configured', label: 'Configured', kind: 'yes-no', negated: 'Not configured', icon: 'i-lucide-list-checks' },
  ],
  sort: {
    fields: [{ key: 'venueName', label: 'Venue', column: 'name', collate: 'nocase' }],
    default: 'venueName',
  },
} as const satisfies ListSpec
