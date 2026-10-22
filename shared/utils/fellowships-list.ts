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

// The refusal for a second award says which kind of fellowship they hold, never just "holds" (0158).
export function fellowshipHeldRefusal(revokedAt: number | null): string {
  return revokedAt === null
    ? 'That person already holds a fellowship'
    : 'That person holds a revoked fellowship, which stays on the roll. A second award is the committee\'s to decide with the IT Manager.'
}
