import { SHIFT_ROLES, saysShiftRole } from './rota'
import type { ListSpec } from './list-filters'

// The pending-approvals declaration (K-129, E-105). "Night" is the claimed shift's own
// performance, 04:00 to 04:00 (0014), never the calendar day.
export const rotaApprovalsList = {
  key: 'rota-approvals',
  search: { placeholder: 'A name or a show', maxLength: 120 },
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
