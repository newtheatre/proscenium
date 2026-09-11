import type { ListSpec } from './list-filters'

// The register's declaration (K-129, A-117, A-130). "Awaiting record" swaps the whole screen to
// the claims queue rather than filtering this table; the endpoint answers the other four only.
export const membershipsList = {
  key: 'members',
  search: { placeholder: 'A name, an address or a student number', maxLength: 200 },
  fields: [
    {
      key: 'filter',
      label: 'Show',
      kind: 'list',
      options: [
        { value: 'current', label: 'Current' },
        { value: 'awaiting-record', label: 'Awaiting record' },
        { value: 'awaiting-check', label: 'Awaiting a check' },
        { value: 'lapsed', label: 'Lapsed' },
        { value: 'everyone', label: 'Everyone ever' },
      ],
      operators: ['is'],
      icon: 'i-lucide-filter',
    },
  ],
  sort: {
    fields: [{ key: 'expiresOn', label: 'Until', column: 'expires_on' }],
    default: 'expiresOn',
    direction: 'desc',
  },
} as const satisfies ListSpec
