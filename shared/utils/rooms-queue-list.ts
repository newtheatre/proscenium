import type { ListSpec } from './list-filters'

// The triage queue's declaration (K-129, C-109, C-120): when, kind and which room. The cap and
// envelope stay bespoke, because a queue is tens of rows and not a paged list.
export const roomsQueueList = {
  key: 'rooms-queue',
  search: { placeholder: 'A name, a room or what it is for' },
  fields: [
    {
      key: 'when',
      label: 'Show',
      kind: 'list',
      options: [{ value: 'open', label: 'Open' }, { value: 'all', label: 'Everything' }],
      operators: ['is'],
      icon: 'i-lucide-inbox',
    },
    {
      key: 'kind',
      label: 'Kind',
      kind: 'list',
      options: [
        { value: 'all', label: 'All rooms' },
        { value: 'room', label: 'Our rooms' },
        { value: 'unlisted', label: 'Rooms we do not manage' },
      ],
      operators: ['is'],
      icon: 'i-lucide-filter',
    },
    { key: 'room', label: 'Room', kind: 'search-list', operators: ['is'], icon: 'i-lucide-door-open' },
  ],
  sort: {
    // Queue order is urgency, not a column: no control has ever offered to change it.
    fields: [{ key: 'order', label: 'Queue order', column: 'created_at' }],
    default: 'order',
  },
} as const satisfies ListSpec
