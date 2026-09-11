import type { ListSpec } from './list-filters'

// The restore drill log's declaration (K-129, K-108, J-107). Nothing is filterable yet; search
// and the recorded order tiebreak are the whole of it.
export const backupDrillsList = {
  key: 'backup-drills',
  search: { placeholder: 'A name or a note', maxLength: 200 },
  fields: [],
  sort: {
    // `recordedOrder` breaks a same-day tie on `rowid`, insertion order: `created_at` is second
    // precision and ties within it, and `id` is a random UUID and no guide to which came later.
    fields: [
      { key: 'ranAt', label: 'Ran', column: 'ran_on' },
      { key: 'recordedOrder', label: 'Recorded order', column: 'rowid' },
    ],
    default: 'ranAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
