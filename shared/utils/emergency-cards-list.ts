import type { ListSpec } from './list-filters'

// The emergency-cards declaration (K-129, E-113). "Filed" is not a column: it asks whether the
// venue has ever had a version recorded, answered from `venue_emergency_info` at query time.
export const emergencyCardsList = {
  key: 'emergency-cards',
  search: { placeholder: 'A venue', maxLength: 120 },
  fields: [
    { key: 'filed', label: 'Filed', kind: 'yes-no', negated: 'Not filed yet', icon: 'i-lucide-siren' },
  ],
  sort: {
    fields: [{ key: 'venueName', label: 'Venue', column: 'name', collate: 'nocase' }],
    default: 'venueName',
  },
} as const satisfies ListSpec
