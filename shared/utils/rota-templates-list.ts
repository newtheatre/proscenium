import type { ListSpec } from './list-filters'

// The shift-templates declaration (K-129, E-101). "Staffed" is not a column: it asks whether
// the venue has any slot at all, answered from `shift_templates` at query time.
export const rotaTemplatesList = {
  key: 'rota-templates',
  search: { placeholder: 'A venue', maxLength: 120 },
  fields: [
    { key: 'staffed', label: 'Staffed', kind: 'yes-no', negated: 'Not staffed', icon: 'i-lucide-clipboard-list' },
  ],
  sort: {
    fields: [{ key: 'venueName', label: 'Venue', column: 'name', collate: 'nocase' }],
    default: 'venueName',
  },
} as const satisfies ListSpec
