import { AUDIT_ACTIONS, AUDIT_ACTION_NAMES, AUDIT_MODULES } from './audit-actions'
import type { ListSpec } from './list-filters'

// The audit trail's declaration (K-129, J-103). Module and action are single-choice, matching
// the screen they replace; actor and the recorded window are new, reachable from the URL now.
export const auditList = {
  key: 'audit',
  search: { placeholder: 'Who or what an entry is about', maxLength: 200 },
  fields: [
    { key: 'actor', label: 'Actor', kind: 'person', column: 'actor_id', icon: 'i-lucide-user' },
    {
      key: 'module',
      label: 'Module',
      kind: 'list',
      options: AUDIT_MODULES.map(module => ({ value: module, label: module })),
      operators: ['is'],
      icon: 'i-lucide-layers',
    },
    {
      key: 'action',
      label: 'Action',
      kind: 'list',
      column: 'action',
      options: AUDIT_ACTION_NAMES.map(name => ({ value: name, label: AUDIT_ACTIONS[name].label })),
      operators: ['is'],
      icon: 'i-lucide-activity',
    },
    { key: 'createdAt', label: 'Recorded', kind: 'date-range', column: 'created_at', dateAs: 'unix', icon: 'i-lucide-calendar' },
  ],
  sort: {
    // `recordedOrder` breaks a tie within the same second: `id` is a random UUID and no guide
    // to which came later, `rowid` is (0006).
    fields: [
      { key: 'createdAt', label: 'When', column: 'created_at' },
      { key: 'recordedOrder', label: 'Recorded order', column: 'rowid' },
    ],
    default: 'createdAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
