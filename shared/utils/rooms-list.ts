import type { ListSpec } from './list-filters'

// The bookable estate's declaration (K-129, C-101). A retired room is hidden unless the officer
// asks for it, the same default accounts uses for an anonymised row (0032).
export const roomsList = {
  key: 'rooms',
  search: { placeholder: 'A room name', maxLength: 120 },
  fields: [
    { key: 'active', label: 'Active', kind: 'yes-no', column: 'is_active', negated: 'Retired', icon: 'i-lucide-door-open' },
  ],
  sort: {
    fields: [{ key: 'name', label: 'Name', column: 'name', collate: 'nocase' }],
    default: 'name',
  },
} as const satisfies ListSpec
