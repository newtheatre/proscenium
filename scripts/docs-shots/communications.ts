import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

// Only ADMIN holds comms.announce and comms.operations (shared/utils/roles.ts), so the
// administrator persona is the one that reaches both screens.
const persona = 'dev-admin@e2e.newtheatre.org.uk'

export const communications: Shot[] = [
  {
    name: 'communications/announce',
    persona,
    url: '/comms/announce',
    marker: '[data-test="audience-kind"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="audience-kind"]', label: 'Audience' },
      { selector: '[data-test="announce-subject"]', label: 'Subject' },
      { selector: '[data-test="announce-body"]', label: 'Message' },
      { selector: '[data-test="announce-safety"]', label: 'Safety notice' },
      { selector: '[data-test="announce-preview"]', label: 'Preview' },
    ],
  },
  {
    name: 'communications/send-log',
    persona,
    url: '/comms/operations',
    marker: '[data-test="send-log-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="daily-counts"]', label: 'Last 14 days' },
      { selector: '[data-test="toolbar-search"]', label: 'Search by type' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="send-log-table"]', label: 'The log' },
    ],
  },
]
