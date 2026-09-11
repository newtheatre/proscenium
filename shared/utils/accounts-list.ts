import { ROLES, saysRole } from './roles'
import type { ListSpec } from './list-filters'

// The account directory's declaration (K-129, A-121). A role and a membership are not columns:
// both are answered from other rows at query time by accountsClause (0009, 0031).
export const accountsList = {
  key: 'accounts',
  search: { placeholder: 'A name, an address or a student number', maxLength: 200 },
  fields: [
    {
      key: 'role',
      label: 'Role',
      kind: 'list',
      options: ROLES.map(role => ({ value: role, label: saysRole(role) })),
      // "Holds no role" is the field below, so one question has one answer.
      operators: ['is', 'not', 'any'],
      cap: ROLES.length,
      icon: 'i-lucide-shield',
    },
    { key: 'holdsRole', label: 'Holds a role', kind: 'yes-no', negated: 'Holds no role', icon: 'i-lucide-shield' },
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
    { key: 'verified', label: 'Address verified', kind: 'yes-no', column: 'verified', negated: 'Address unverified' },
    { key: 'disabled', label: 'Disabled', kind: 'yes-no', column: 'disabled' },
    { key: 'anonymised', label: 'Anonymised', kind: 'yes-no' },
    { key: 'authenticator', label: 'Authenticator enrolled', kind: 'yes-no', negated: 'No authenticator' },
    { key: 'privilegedWithoutFactor', label: 'Privileged, no authenticator', kind: 'yes-no', negated: 'Not privileged, or has an authenticator' },
    { key: 'approachingRetention', label: 'Approaching retention', kind: 'yes-no' },
    { key: 'neverSignedIn', label: 'Never signed in', kind: 'yes-no', negated: 'Has signed in' },
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
} as const satisfies ListSpec
