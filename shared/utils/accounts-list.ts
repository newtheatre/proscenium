import { ROLES, saysRole } from './roles'
import type { ListSpec } from './list-filters'

// The account directory's declaration (K-129, A-121). A role and a membership are not columns:
// both are answered from other rows at query time by accountsClause (0009, 0031).
export const accountsList: ListSpec = {
  key: 'accounts',
  search: { placeholder: 'A name, an address or a student number', maxLength: 200 },
  fields: [
    {
      key: 'role',
      label: 'Role',
      kind: 'list',
      options: ROLES.map(role => ({ value: role, label: saysRole(role) })),
      cap: ROLES.length,
      icon: 'i-lucide-shield',
    },
    {
      key: 'membership',
      label: 'Membership',
      kind: 'list',
      options: [
        { value: 'current', label: 'Current' },
        { value: 'lapsed', label: 'Lapsed' },
        { value: 'none', label: 'Never a member' },
      ],
      operators: ['is'],
      icon: 'i-lucide-id-card',
    },
    { key: 'holdsRole', label: 'Holds a role', kind: 'yes-no', icon: 'i-lucide-shield' },
    { key: 'verified', label: 'Address verified', kind: 'yes-no', column: 'verified' },
    { key: 'disabled', label: 'Disabled', kind: 'yes-no', column: 'disabled' },
    { key: 'anonymised', label: 'Anonymised', kind: 'yes-no' },
    { key: 'authenticator', label: 'Authenticator enrolled', kind: 'yes-no' },
    { key: 'privilegedWithoutFactor', label: 'Privileged, no authenticator', kind: 'yes-no' },
    { key: 'approachingRetention', label: 'Approaching retention', kind: 'yes-no' },
    { key: 'neverSignedIn', label: 'Never signed in', kind: 'yes-no' },
    { key: 'lastLoginAt', label: 'Last seen', kind: 'date-range', column: 'last_login_at', dateAs: 'unix', icon: 'i-lucide-clock' },
  ],
  sort: {
    fields: [
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
      { key: 'lastLoginAt', label: 'Last seen', column: 'last_login_at' },
      { key: 'createdAt', label: 'Joined', column: 'created_at' },
    ],
    default: 'name',
  },
}
