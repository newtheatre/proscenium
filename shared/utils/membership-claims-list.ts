import type { ListSpec } from './list-filters'

// The claims queue's own declaration (K-129, A-130 criterion 9), never the register's. With no
// status asked the endpoint shows what is waiting; the others find a claim already decided.
export const membershipClaimsList = {
  key: 'membership-claims',
  search: { placeholder: 'A name, an address or a student number', maxLength: 200 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      // In CLAIM_STATUSES order; the unit test holds the two together.
      options: [
        { value: 'OPEN', label: 'Waiting' },
        { value: 'RECORDED', label: 'Recorded' },
        { value: 'DECLINED', label: 'Declined' },
        { value: 'WITHDRAWN', label: 'Withdrawn' },
      ],
      operators: ['is'],
      icon: 'i-lucide-inbox',
    },
  ],
  sort: {
    // `recordedOrder` breaks a tie within the same second on `rowid`, insertion order (0006).
    fields: [
      { key: 'createdAt', label: 'Waiting since', column: 'created_at' },
      { key: 'decidedAt', label: 'Decided', column: 'decided_at' },
      { key: 'recordedOrder', label: 'Recorded order', column: 'rowid' },
    ],
    default: 'createdAt',
    direction: 'asc',
  },
} as const satisfies ListSpec
