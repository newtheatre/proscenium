import { PERFORMANCE_STATUSES, saysPerformanceStatus } from './programme'
import type { ListSpec } from './list-filters'

// One show's performances as a console list (D-132, K-129). The venue picker takes its options
// from the show's own venues at runtime, so the declaration names the column and not the values.
export const performancesList = {
  key: 'performances',
  search: { placeholder: 'A venue', maxLength: 120 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: PERFORMANCE_STATUSES.map(status => ({ value: status, label: saysPerformanceStatus(status) })),
      operators: ['is', 'not'],
      icon: 'i-lucide-ticket',
    },
    { key: 'venueId', label: 'Venue', kind: 'search-list', column: 'venue_id', cap: 12, operators: ['is', 'not'], icon: 'i-lucide-map-pin' },
    { key: 'startsAt', label: 'Curtain', kind: 'date-range', column: 'starts_at', dateAs: 'unix', icon: 'i-lucide-calendar-days' },
    { key: 'external', label: 'Externally ticketed', kind: 'yes-no', negated: 'Ticketed by us', icon: 'i-lucide-external-link' },
  ],
  sort: {
    fields: [
      { key: 'startsAt', label: 'Curtain', column: 'starts_at' },
      { key: 'venue', label: 'Venue', column: 'v.name', collate: 'nocase' },
    ],
    default: 'startsAt',
  },
} as const satisfies ListSpec
