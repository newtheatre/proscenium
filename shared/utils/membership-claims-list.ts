import type { ListSpec } from './list-filters'

// The claims queue's declaration (K-129, A-130): search, sort and page, the whole of what the
// queue view under people/members.vue offers. Status stays fixed at OPEN, the endpoint's own job.
export const membershipClaimsList = {
  key: 'membership-claims',
  search: { placeholder: 'A name, an address or a student number', maxLength: 200 },
  fields: [],
  sort: {
    // `recordedOrder` breaks a tie within the same second on `rowid`, insertion order (0006).
    fields: [
      { key: 'createdAt', label: 'Waiting since', column: 'created_at' },
      { key: 'recordedOrder', label: 'Recorded order', column: 'rowid' },
    ],
    default: 'createdAt',
    direction: 'asc',
  },
} as const satisfies ListSpec
