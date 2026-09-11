import { SHIFT_ROLES, saysShiftRole } from './rota'
import type { ListSpec } from './list-filters'

// The unfilled-shifts declaration (K-129, E-107). "Night" answers the performance's own start
// time, 04:00 to 04:00 (0014), never the calendar day the column would otherwise compare as.
export const unfilledShiftsList = {
  key: 'unfilled-shifts',
  search: { placeholder: 'A show or a venue', maxLength: 120 },
  fields: [
    {
      key: 'role',
      label: 'Role',
      kind: 'list',
      column: 's.role',
      options: SHIFT_ROLES.map(role => ({ value: role, label: saysShiftRole(role) })),
      operators: ['is', 'not', 'any'],
      cap: SHIFT_ROLES.length,
      icon: 'i-lucide-user-round',
    },
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 's.status',
      options: [{ value: 'OPEN', label: 'Open' }, { value: 'DECLINED', label: 'Declined' }],
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-circle-dashed',
    },
    { key: 'night', label: 'Night', kind: 'date-range', column: 'p.starts_at', dateAs: 'night', icon: 'i-lucide-moon' },
  ],
  sort: {
    fields: [
      { key: 'startsAt', label: 'Starts', column: 'p.starts_at' },
      { key: 'role', label: 'Role', column: 's.role' },
    ],
    default: 'startsAt',
  },
} as const satisfies ListSpec
