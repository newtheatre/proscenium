import { CONSOLE_WIDTH, PHONE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-member@e2e.newtheatre.org.uk'

export const members: Shot[] = [
  {
    name: 'members/my',
    persona,
    url: '/my',
    marker: '[data-test="my-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="my-tile-next-shift"]', label: 'Next shift' },
      { selector: '[data-test="my-tile-membership"]', label: 'Membership' },
      { selector: '[data-test="my-tile-training"]', label: 'Training' },
    ],
  },
  {
    name: 'members/whats-on',
    persona,
    url: '/whats-on',
    marker: '[data-test="whats-on-page"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="whats-on-venues"]', label: 'Filter by venue' },
      { selector: '[data-test^="show-"]', label: 'A show\'s card' },
      { selector: '[data-test^="book-"]', label: 'Book' },
    ],
  },
  {
    name: 'members/show',
    persona,
    url: '/shows/the-seagull',
    marker: '[data-test="show-page"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="show-dates"]', label: 'Dates' },
      { selector: '[data-test="show-tickets"]', label: 'Tickets' },
      { selector: '[data-test="show-book"]', label: 'Book tickets' },
      { selector: '[data-test="show-performances"]', label: 'Performances' },
    ],
  },
  {
    name: 'members/passes',
    persona,
    url: '/account/passes',
    marker: '[data-test="account-passes-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="account-passes-held"]', label: 'Your passes' },
      { selector: '[data-test="account-passes-sellable"]', label: 'Request a pass' },
    ],
  },
  {
    name: 'members/rooms',
    persona,
    url: '/rooms',
    marker: '[data-test="calendar-span"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="calendar-today"]', label: 'Today' },
      { selector: '[data-test="calendar-room"]', label: 'Every room, or one' },
      { selector: '[data-test="book-unlisted"]', label: 'A room not listed here' },
      { selector: '[data-test^="slot-"]', label: 'A quarter hour to book' },
    ],
  },
  {
    name: 'members/book-a-room',
    persona,
    url: '/rooms/book',
    marker: '[data-test="booking-form"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="booking-room"]', label: 'Room' },
      { selector: '[data-test="booking-title"]', label: 'What it is for' },
      { selector: '[data-test="booking-day"]', label: 'Day' },
      { selector: '[data-test="booking-from"]', label: 'From' },
    ],
  },
  {
    name: 'members/room-bookings',
    persona,
    url: '/rooms/mine',
    marker: '[data-test="rooms-mine-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="mine-upcoming"]', label: 'Coming up and past' },
      // Exclusive: the page renders one or the other, never both.
      { selector: '[data-test="mine-list"], [data-test="mine-empty"]', label: 'The list' },
      { selector: '[data-test="feed-card"]', label: 'Your own calendar' },
    ],
  },
  {
    name: 'members/other-rooms',
    persona,
    url: '/rooms/external',
    marker: '[data-test="external-warning"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="external-title"]', label: 'What it is for' },
      { selector: '[data-test="external-purpose"]', label: 'What the room is for' },
      { selector: '[data-test="external-day"]', label: 'Day' },
      { selector: '[data-test="external-from"]', label: 'From' },
    ],
  },
  {
    name: 'members/rota',
    persona,
    url: '/rota',
    marker: '[data-test="rota-page"]',
    width: PHONE_WIDTH,
    annotations: [
      // Absent for a member holding nothing; the role filter then stands in for it.
      { selector: '[data-test="my-shifts"], [data-test="role-filter-all"]', label: 'What you hold' },
      { selector: '[data-test="role-filter-DOOR"]', label: 'Filter by role' },
      { selector: '[data-test="open-shifts-list"], [data-test="open-shifts-empty"]', label: 'Open shifts' },
    ],
  },
  {
    name: 'members/training',
    persona,
    url: '/training',
    marker: '[data-test="training-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="records"], [data-test="records-empty"]', label: 'Records' },
      { selector: '[data-test="my-sessions"]', label: 'Signed up to' },
    ],
  },
  {
    name: 'members/training-sessions',
    persona,
    url: '/training/sessions',
    marker: '[data-test="sessions-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="open-sessions"]', label: 'Coming up' },
      { selector: '[data-test^="session-"], [data-test="sessions-empty"]', label: 'A session' },
      { selector: '[data-test^="signup-"], [data-test="sessions-empty"]', label: 'Sign up' },
    ],
  },
  {
    name: 'members/access',
    persona,
    url: '/account/access',
    marker: '[data-test="access-form"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="flag-standing"]', label: 'What you need' },
      { selector: '[data-test="access-companions"]', label: 'Companions' },
      { selector: '[data-test="access-note"]', label: 'In your own words' },
      { selector: '[data-test="access-save"]', label: 'Submit' },
    ],
  },
]
