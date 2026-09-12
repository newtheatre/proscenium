import { MAX_TICKET_TYPE_NAME } from './ticket-types'
import type { ListSpec } from './list-filters'

// The ticket types list's declaration (K-129). Archiving is the only lifecycle a type has once
// anything has sold under it (D-119 criterion 2).
export const ticketTypesList = {
  key: 'ticket-types',
  search: { placeholder: 'A ticket type', maxLength: MAX_TICKET_TYPE_NAME },
  fields: [
    { key: 'archived', label: 'Archived', kind: 'yes-no', column: 'archived', negated: 'Hiding archived types', icon: 'i-lucide-archive' },
  ],
  sort: {
    fields: [
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'name',
  },
} as const satisfies ListSpec
