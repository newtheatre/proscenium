import type { ListSpec } from './list-filters'

// The catalogue of rooms we do not manage, declared (K-129, C-119). A retired room is hidden
// unless the officer asks for it, the same default the bookable estate uses.
export const externalSpacesList = {
  key: 'external-spaces',
  search: { placeholder: 'A room, a building or a campus', maxLength: 120 },
  fields: [
    { key: 'active', label: 'Still worth asking for', kind: 'yes-no', column: 'is_active', negated: 'Retired', icon: 'i-lucide-map-pin' },
  ],
  sort: {
    fields: [{ key: 'name', label: 'Name', column: 'name', collate: 'nocase' }],
    default: 'name',
  },
} as const satisfies ListSpec
