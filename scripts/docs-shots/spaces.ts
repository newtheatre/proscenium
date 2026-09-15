import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

// The Theatre Manager holds rooms.write, so every Spaces screen and every button is reachable.
const persona = 'dev-theatre@e2e.newtheatre.org.uk'

export const spaces: Shot[] = [
  {
    name: 'spaces/rooms',
    persona,
    url: '/rooms/manage',
    marker: '[data-test="rooms-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="to-other-rooms"]', label: 'Other rooms' },
      { selector: '[data-test="add-room"]', label: 'Add a room' },
      { selector: '[data-test="rooms-table"]', label: 'The estate' },
      { selector: '[data-test^="edit-room-"]', label: 'Edit' },
    ],
  },
  {
    name: 'spaces/room-form',
    persona,
    url: '/rooms/manage',
    marker: '[data-test="rooms-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test="add-room"]\').click()',
    annotations: [
      { selector: '[data-test="room-name"]', label: 'Name' },
      { selector: '[data-test="room-capacity"]', label: 'Capacity' },
      { selector: '[data-test="hours-section"]', label: 'Opening hours' },
      { selector: '[data-test="room-sensitive"]', label: 'Every booking needs approval' },
      { selector: '[data-test="policy-section"]', label: 'This room\'s own rules' },
      { selector: '[data-test="room-save"]', label: 'Add it' },
    ],
  },
  {
    name: 'spaces/room-requests',
    persona,
    url: '/rooms/manage/requests',
    marker: '[data-test="requests-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="select-all"]', label: 'Select every request shown' },
      { selector: '[data-test="requests-table"]', label: 'The queue' },
      { selector: '[data-test^="approve-"]:not([data-test="approve-selected"])', label: 'Approve' },
      { selector: '[data-test^="move-"]', label: 'Approve into another room' },
      { selector: '[data-test^="reject-"]:not([data-test="reject-selected"])', label: 'Reject' },
      { selector: '[data-test^="unlist-"]', label: 'Not one of ours' },
    ],
  },
  {
    name: 'spaces/closure-form',
    persona,
    url: '/rooms/manage/closures',
    marker: '[data-test="blackouts-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test="close-room"]\').click()',
    annotations: [
      { selector: '[data-test="close-room-id"]', label: 'Which room' },
      { selector: '[data-test="close-reason"]', label: 'Why' },
      { selector: '[data-test="close-day"]', label: 'Day' },
      { selector: '[data-test="close-from"]', label: 'From and until' },
      { selector: '[data-test="close-submit"]', label: 'Close the room' },
    ],
  },
  {
    name: 'spaces/closures',
    persona,
    url: '/rooms/manage/closures',
    marker: '[data-test="blackouts-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="close-room"]', label: 'Close a room' },
      { selector: '[data-test="blackouts-table"]', label: 'The closures' },
      { selector: '[data-test^="reopen-"]:not([data-test="reopen-confirm"])', label: 'Reopen' },
    ],
  },
  {
    name: 'spaces/other-rooms',
    persona,
    url: '/rooms/manage/other',
    marker: '[data-test="spaces-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="add-space"]', label: 'List a room' },
      { selector: '[data-test="spaces-table"]', label: 'The catalogue' },
      { selector: '[data-test^="note-"]:not([data-test^="note-purpose-"]):not([data-test^="note-verdict-"]):not([data-test="note-reason"]):not([data-test="note-submit"])', label: 'Note something' },
      { selector: '[data-test^="edit-space-"]', label: 'Edit' },
    ],
  },
  {
    name: 'spaces/other-rooms-note',
    persona,
    url: '/rooms/manage/other',
    marker: '[data-test="spaces-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test^="note-"]:not([data-test^="note-purpose-"]):not([data-test^="note-verdict-"])\').click()',
    annotations: [
      { selector: '[data-test="note-purpose-REHEARSAL"]', label: 'For what' },
      { selector: '[data-test="note-verdict-UNSUITABLE"]', label: 'How it went' },
      { selector: '[data-test="note-reason"]', label: 'Why' },
      { selector: '[data-test="note-submit"]', label: 'Note it' },
    ],
  },
  {
    name: 'spaces/utilisation',
    persona,
    url: '/rooms/manage/utilisation',
    marker: '[data-test="utilisation-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-filters"]', label: 'Filters: the From and Until dates' },
      { selector: '[data-test="report-export"]', label: 'Export' },
      { selector: '[data-test="utilisation-table"]', label: 'The report' },
      { selector: '[data-test="utilisation-totals"]', label: 'Totals' },
    ],
  },
]
