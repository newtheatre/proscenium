import { BAR_OPENING_STATUSES, saysBarOpeningStatus } from './rota-openings'
import type { ListSpec } from './list-filters'

// The bar-openings declaration (K-129, E-130). "Night" answers the opening's own start time,
// 04:00 to 04:00 (0014), never the calendar day the column would otherwise compare as.
export const rotaOpeningsList = {
  key: 'rota-openings',
  search: { placeholder: 'An opening or a venue', maxLength: 120 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'o.status',
      options: BAR_OPENING_STATUSES.map(status => ({ value: status, label: saysBarOpeningStatus(status) })),
      operators: ['is', 'not', 'any'],
      cap: BAR_OPENING_STATUSES.length,
      icon: 'i-lucide-circle-dashed',
    },
    { key: 'night', label: 'Night', kind: 'date-range', column: 'o.starts_at', dateAs: 'night', icon: 'i-lucide-moon' },
  ],
  sort: {
    fields: [
      { key: 'startsAt', label: 'Opens', column: 'o.starts_at' },
      { key: 'venueName', label: 'Venue', column: 'v.name', collate: 'nocase' },
    ],
    default: 'startsAt',
  },
} as const satisfies ListSpec
