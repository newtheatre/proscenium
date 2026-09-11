import { CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TOPICS, TOPIC_LABELS } from './notifications'
import type { ListSpec } from './list-filters'

// The send log's declaration (K-129, H-106). Type stays free text: the catalogue is too wide for
// a single closed list, and the box already reads that way.
export const sendLogList = {
  key: 'send-log',
  search: { placeholder: 'A message type, such as shift.reminder', maxLength: 100 },
  fields: [
    {
      key: 'topic',
      label: 'Topic',
      kind: 'list',
      options: NOTIFICATION_TOPICS.map(topic => ({ value: topic, label: TOPIC_LABELS[topic] })),
      operators: ['is'],
      icon: 'i-lucide-layers',
    },
    { key: 'channel', label: 'Channel', kind: 'list', column: 'channel', options: CHANNELS.map(value => ({ value, label: value })), icon: 'i-lucide-radio' },
    { key: 'status', label: 'Outcome', kind: 'list', column: 'status', options: NOTIFICATION_STATUSES.map(value => ({ value, label: value })), icon: 'i-lucide-flag' },
    { key: 'createdAt', label: 'Sent', kind: 'date-range', column: 'created_at', dateAs: 'unix', icon: 'i-lucide-calendar' },
  ],
  sort: {
    fields: [{ key: 'createdAt', label: 'Enqueued', column: 'created_at' }],
    default: 'createdAt',
    direction: 'desc',
  },
} as const satisfies ListSpec
