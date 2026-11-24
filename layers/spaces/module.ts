// Room bookings (module `spaces`): booking rooms and shared resources, with rules, clashes and
// approval (docs/specs/spaces-and-room-booking). A person reads "Room bookings" everywhere; only the
// module id and the addresses say spaces. This file grows with the build; it declares what the code
// so far uses.
import { z } from 'zod'
import { ability, code, defineAbilities, defineModule, defineRecords, defineSettings, event, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'spaces.settings.manage'
const booking = { bookingId: z.string(), bookableId: z.string() }
const times = { startsAt: z.number().int(), endsAt: z.number().int(), seriesId: z.string().nullable() }

export default defineModule({
  id: 'spaces',
  manifest: 1,
  since: '0.5.0',
  stability: 'experimental',
  uses: ['forms'],

  // Part 6. Every setting holds one value for the whole theatre; a value that varies by purpose or
  // by bookable is a column on that record that falls back to the setting.
  settings: defineSettings('spaces', {
    'bookings.slot-size': setting.choice({ default: '15', options: ['5', '10', '15', '30', '60'], change, audience: 'signed-in' }),
    'bookings.max-length': setting.duration({ default: '4h', min: '15m', max: '24h', change, audience: 'signed-in' }),
    'bookings.max-ahead': setting.duration({ default: '60d', min: '1d', max: '730d', units: ['week', 'day'], change, audience: 'signed-in' }),
    'bookings.min-notice': setting.duration({ default: '0m', min: '0m', max: '14d', change, audience: 'signed-in' }),
    'bookings.cancel-notice': setting.duration({ default: '24h', min: '0m', max: '14d', change, audience: 'signed-in' }),
    // Shortening it lets the next retention sweep remove bookings that would have been kept.
    'bookings.keep-for': setting.duration({ default: '2y', min: '90d', max: '7y', units: ['year', 'month', 'week', 'day'], change, audience: 'staff', onChange: 'confirm' }),
    'series.max-occurrences': setting.integer({ default: 52, min: 2, max: 104, change, audience: 'signed-in' }),
    'requests.remind-after': setting.duration({ default: '48h', min: '1h', max: '14d', change, audience: 'staff' }),
    'bumping.enabled': setting.boolean({ default: true, change, audience: 'signed-in' }),
    'bumping.notice': setting.duration({ default: '48h', min: '0m', max: '30d', change, audience: 'signed-in' }),
    'bumping.contact': setting.text({ unset: true, maxLength: 120, change, audience: 'signed-in' }),
    'calendar.show-details': setting.choice({ default: 'purpose', options: ['full', 'purpose', 'busy'], change, audience: 'signed-in' }),
    'calendar.day-starts': setting.time({ default: '08:00', min: '00:00', max: '12:00', change, audience: 'signed-in' }),
    'calendar.day-ends': setting.time({ default: '23:00', min: '12:00', max: '23:59', change, audience: 'signed-in' }),
    'calendar.week-starts': setting.choice({ default: 'monday', options: ['monday', 'sunday'], change, audience: 'signed-in' }),
    'reminders.before': setting.duration({ default: '24h', min: '0m', max: '7d', change, audience: 'signed-in' }),
    'no-show.window': setting.duration({ default: '14d', min: '1d', max: '90d', units: ['week', 'day'], change, audience: 'staff' }),
  }),

  // A grant on a venue reaches its spaces, their bookables and their bookings. A resource's
  // bookable has no parent, so it is reached by a site-wide grant or one on the resource itself.
  records: defineRecords('spaces', {
    bookable: { table: 'spaces_bookables', parent: 'core.space' },
    booking: { table: 'spaces_bookings', parent: 'spaces.bookable', owner: 'booked_for' },
    purpose: { table: 'spaces_purposes' },
  }),

  abilities: defineAbilities('spaces', {
    // Each ability is declared with the first route that needs it (spec part 6).
    // Seeing a bookable's calendar is not audited; it is shaped by rule K2.
    'calendar.view': ability({ on: 'spaces.bookable', audit: false }),
    'booking.request': ability({ on: 'spaces.bookable', implies: ['calendar.view'] }),
    // A booker always sees their own booking, with its notes.
    'booking.view': ability({ on: 'spaces.booking', owner: 'grants', audit: 'read', implies: ['calendar.view', 'core.account.find'] }),
    'booking.manage': ability({ on: 'spaces.booking', implies: ['booking.view', 'booking.request'] }),
    // Sets aside the limits, hours and requirements everyone else is held to, with a reason (P10).
    'booking.override': ability({ on: 'spaces.bookable', risk: 'privileged', implies: ['booking.manage'] }),
    'bookable.manage': ability({ on: 'spaces.bookable', implies: ['calendar.view'] }),
    'purpose.manage': ability({}),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  tasks: {
    // Confirmed past its end becomes Completed; Requested past its start becomes Expired.
    'spaces.sweep-bookings': task({ every: '15m' }),
    'spaces.send-reminders': task({ every: '15m' }),
  },

  contributes: {
    // Set-up screens are Admin tabs of the module, reached from the console through the cog.
    'core.navigation': [
      { id: 'spaces.bookables', menu: 'admin', group: 'modules', to: '/admin/modules/spaces/bookables', icon: 'i-lucide-door-open', ability: 'spaces.bookable.manage', order: 60 },
      { id: 'spaces.calendar', menu: 'members', to: '/members/spaces', icon: 'i-lucide-calendar-range', ability: 'spaces.calendar.view', order: 40 },
      { id: 'spaces.purposes', menu: 'admin', group: 'modules', to: '/admin/modules/spaces/purposes', icon: 'i-lucide-list-ordered', ability: 'spaces.purpose.manage', order: 70 },
    ],
    // Nothing can be booked until a room is bookable and there is something to book it for.
    'core.setup-step': [
      { id: 'spaces.bookables', required: true, to: '/admin/modules/spaces/bookables', order: 70 },
      { id: 'spaces.purposes', required: true, to: '/admin/modules/spaces/purposes', order: 71 },
    ],
    'core.notification-topic': [{ id: 'spaces.reminders', side: 'members' as const, order: 70 }],
    'core.notification-type': [{
      id: 'spaces.booking-reminder',
      category: 'optional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      topic: 'spaces.reminders',
      link: '/members/spaces/bookings',
      variables: { room: 'text' as const, date: 'text' as const, when: 'text' as const, title: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your room booking: {{ room }}, {{ date }}',
          body: 'A reminder that you have **{{ room }}** booked on {{ date }}, {{ when }}, for {{ title }}.\n\nIf you no longer need it, please cancel it so someone else can use the room.',
          action: 'See my bookings',
        },
      },
    }, {
      id: 'spaces.booking-cancelled',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/spaces/bookings',
      variables: { room: 'text' as const, date: 'text' as const, when: 'text' as const, title: 'text' as const, note: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your room booking is cancelled: {{ room }}, {{ date }}',
          body: 'Your booking of **{{ room }}** on {{ date }}, {{ when }}, for {{ title }}, has been cancelled by the theatre.\n\n{{ note }}',
          action: 'Book again',
        },
      },
    }],
    'core.record-resolver': [
      { id: 'spaces.bookable', file: 'bookable' },
      { id: 'spaces.booking', file: 'booking' },
      { id: 'spaces.purpose', file: 'purpose' },
    ],
  },

  // Payloads carry ids and times, never names or free text. A series announces one event per
  // occurrence, so a listener never needs to know series exist.
  events: {
    announces: {
      'spaces.booking.requested': event({ version: 1, payload: z.object({ ...booking, ...times }), internal: true }),
      'spaces.booking.confirmed': event({ version: 1, payload: z.object({ ...booking, ...times, decided: z.boolean() }), internal: true }),
      'spaces.booking.declined': event({ version: 1, payload: z.object(booking), internal: true }),
      'spaces.booking.withdrawn': event({ version: 1, payload: z.object(booking), internal: true }),
      'spaces.booking.expired': event({ version: 1, payload: z.object(booking), internal: true }),
      'spaces.booking.changed': event({ version: 1, payload: z.object({ ...booking, oldBookableId: z.string(), oldStartsAt: z.number().int(), oldEndsAt: z.number().int(), startsAt: z.number().int(), endsAt: z.number().int() }), internal: true }),
      'spaces.booking.cancelled': event({ version: 1, payload: z.object({ ...booking, reason: code(), late: z.boolean() }), internal: true }),
      'spaces.booking.bumped': event({ version: 1, payload: z.object({ ...booking, reason: code(), bumpedById: z.string().nullable() }), internal: true }),
      'spaces.booking.completed': event({ version: 1, payload: z.object(booking), internal: true }),
      'spaces.booking.no-show': event({ version: 1, payload: z.object({ ...booking, set: z.boolean() }), internal: true }),
      'spaces.bookable.created': event({ version: 1, payload: z.object({ bookableId: z.string() }), internal: true }),
      'spaces.bookable.paused': event({ version: 1, payload: z.object({ bookableId: z.string() }), internal: true }),
      'spaces.bookable.archived': event({ version: 1, payload: z.object({ bookableId: z.string() }), internal: true }),
    },
    listens: {
      'core.space.managed-changed': 'follow-managed',
      'core.space.archived': 'follow-archived',
      'core.venue.archived': 'follow-archived',
    },
  },

  presets: {
    'amateur-company': { settings: { 'spaces.bookings.max-ahead': '180d' } },
    'small-venue': { settings: { 'spaces.bumping.enabled': false, 'spaces.calendar.show-details': 'purpose' } },
  },
})
