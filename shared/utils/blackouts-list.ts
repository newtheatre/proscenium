import type { ListSpec } from './list-filters'

// Room closures' declaration (K-129, C-114). A past closure is hidden unless the officer asks for
// one, the same default the bookable estate uses for a retired room.
export const blackoutsList = {
  key: 'blackouts',
  search: { placeholder: 'A room or a reason', maxLength: 200 },
  fields: [
    { key: 'past', label: 'Past', kind: 'yes-no', negated: 'Still to come', icon: 'i-lucide-history' },
  ],
  sort: {
    fields: [{ key: 'startsAt', label: 'Starts', column: 'starts_at' }],
    default: 'startsAt',
  },
} as const satisfies ListSpec
