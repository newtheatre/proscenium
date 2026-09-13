import { ACCESS_PROFILE_STATUSES, saysAccessProfileStatus } from './access-profiles'
import type { ListSpec } from './list-filters'

// The accessibility officer's queue declaration (K-129, D-127). Pending is the hidden default the
// register gives "current": not a database value, so "everyone" is its own choice, "ALL".
export const accessProfilesList = {
  key: 'access-profiles',
  search: { placeholder: 'A name or an address', maxLength: 200 },
  fields: [
    {
      key: 'status',
      label: 'Show',
      kind: 'list',
      operators: ['is'],
      icon: 'i-lucide-list-filter',
      options: [
        { value: 'ALL', label: 'Everyone' },
        ...ACCESS_PROFILE_STATUSES.map(value => ({ value, label: saysAccessProfileStatus(value) })),
      ],
    },
  ],
  sort: {
    fields: [{ key: 'createdAt', label: 'Declared', column: 'created_at' }],
    default: 'createdAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
