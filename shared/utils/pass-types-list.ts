import { MAX_PASS_TYPE_NAME, PASS_TYPE_STATUSES, saysPassTypeStatus } from './pass-types'
import type { ListSpec } from './list-filters'

// The pass types list's declaration (K-129). The reserved Fellowship slug is excluded from the
// listing at the query, not by a filter here, so it is nobody's to browse to (D-130).
export const passTypesList = {
  key: 'pass-types',
  search: { placeholder: 'A pass', maxLength: MAX_PASS_TYPE_NAME },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: PASS_TYPE_STATUSES.map(status => ({ value: status, label: saysPassTypeStatus(status) })),
      operators: ['is'],
      icon: 'i-lucide-eye',
    },
  ],
  sort: {
    fields: [
      { key: 'status', label: 'Status', column: 'status' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'status',
  },
} as const satisfies ListSpec
