import { ROLES, saysRole } from './roles'
import type { ListSpec } from './list-filters'

// The role register's declaration (A-131, K-129). Its rows are grants, not accounts: the holder's
// name and address come from the join, and live or lapsed is the expiry read now (0009).
export const rolesList = {
  key: 'roles',
  search: { placeholder: 'A name or an address', maxLength: 200 },
  fields: [
    {
      key: 'role',
      label: 'Role',
      kind: 'list',
      column: 'role',
      options: ROLES.map(role => ({ value: role, label: saysRole(role) })),
      operators: ['is', 'not', 'any'],
      cap: ROLES.length,
      icon: 'i-lucide-shield',
    },
    { key: 'lapsed', label: 'Lapsed', kind: 'yes-no', negated: 'Live', icon: 'i-lucide-clock' },
    { key: 'permanent', label: 'Permanent', kind: 'yes-no', negated: 'Expires', icon: 'i-lucide-infinity' },
    { key: 'expiresAt', label: 'Expires', kind: 'date-range', column: 'expires_at', dateAs: 'unix', icon: 'i-lucide-calendar' },
    { key: 'grantedAt', label: 'Granted', kind: 'date-range', column: 'granted_at', dateAs: 'unix', icon: 'i-lucide-calendar-plus' },
  ],
  sort: {
    fields: [
      { key: 'name', label: 'Holder', column: 'name', collate: 'nocase' },
      { key: 'expiresAt', label: 'Expires', column: 'expires_at' },
      { key: 'grantedAt', label: 'Granted', column: 'granted_at' },
    ],
    default: 'name',
  },
} as const satisfies ListSpec
