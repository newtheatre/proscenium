import type { ListSpec } from './list-filters'

// The roll's declaration (K-129, A-127).
export const fellowshipsList = {
  key: 'fellows',
  search: { placeholder: 'A name, an address or a citation', maxLength: 200 },
  fields: [
    {
      key: 'show',
      label: 'Show',
      kind: 'list',
      options: [
        { value: 'current', label: 'Current Fellows' },
        { value: 'revoked', label: 'Revoked' },
        { value: 'everyone', label: 'Everyone ever' },
      ],
      operators: ['is'],
      icon: 'i-lucide-award',
    },
  ],
  sort: {
    fields: [{ key: 'awardedOn', label: 'Awarded', column: 'awarded_on' }],
    default: 'awardedOn',
  },
} as const satisfies ListSpec
