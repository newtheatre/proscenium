import { DELIVERY_MODES, MODULE_KINDS, MODULE_LIFECYCLE, saysDeliveryMode, saysKind, saysLifecycle } from './training'
import type { ListSpec } from './list-filters'

// The training catalogue's declaration (K-129, G-129). A lead's own scope is a fixed predicate,
// never a field the reader could turn off, so it carries no entry here.
export const trainingModulesList = {
  key: 'training-modules',
  search: { placeholder: 'A module id or its title', maxLength: 120 },
  fields: [
    // A department's options are only known at runtime, so this is search-list rather than list,
    // the way shows-list.ts reads a season (K-129).
    { key: 'department', label: 'Department', kind: 'search-list', column: 'department', operators: ['is', 'not', 'any'], icon: 'i-lucide-building-2' },
    {
      key: 'kind',
      label: 'Kind',
      kind: 'list',
      column: 'kind',
      options: MODULE_KINDS.map(value => ({ value, label: saysKind(value) })),
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-shapes',
    },
    {
      key: 'lifecycle',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: MODULE_LIFECYCLE.map(value => ({ value, label: saysLifecycle(value) })),
      operators: ['is', 'not'],
      icon: 'i-lucide-eye',
    },
    { key: 'safetyCritical', label: 'Safety critical', kind: 'yes-no', column: 'safety_critical' },
    {
      key: 'deliveryMode',
      label: 'Delivery',
      kind: 'list',
      column: 'delivery_mode',
      options: DELIVERY_MODES.map(value => ({ value, label: saysDeliveryMode(value) })),
      operators: ['is', 'not'],
      icon: 'i-lucide-presentation',
    },
  ],
  sort: {
    fields: [
      { key: 'sort', label: 'List order', column: 'sort' },
      { key: 'name', label: 'Title', column: 'name', collate: 'nocase' },
    ],
    default: 'sort',
  },
} as const satisfies ListSpec
