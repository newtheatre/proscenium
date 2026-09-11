import type { ListSpec } from './list-filters'

// The utilisation report's declaration (K-129, C-117). The breakdown is a question the report
// answers rather than a column, so it is a field with no column of its own.
export const utilisationList = {
  key: 'utilisation',
  search: { placeholder: 'A room or a kind', maxLength: 120 },
  fields: [
    {
      key: 'by',
      label: 'Break down by',
      kind: 'list',
      options: [{ value: 'room', label: 'Room' }, { value: 'tier', label: 'Kind of booking' }],
      operators: ['is'],
      icon: 'i-lucide-layers',
    },
  ],
  sort: {
    // Always busiest first; the report has never offered a control to change it.
    fields: [{ key: 'confirmedHours', label: 'Hours used', column: 'confirmed_hours' }],
    default: 'confirmedHours',
    direction: 'desc',
  },
} as const satisfies ListSpec
