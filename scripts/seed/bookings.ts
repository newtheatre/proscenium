// Reservations in every status the lifecycle has, with the tickets they hold: what the desk, the
// door, the capacity bar and a member's own bookings page each need before they show anything.

import { RESERVATION_REFERENCE_LENGTH } from '../../shared/utils/reservations'
import { insert, seedId } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { Programme } from './programme'
import type { BoundStatement, SeedTarget } from './statements'

// The reference alphabet excludes look-alikes, and a seeded reference has to satisfy the same
// shape a desk search matches on (D-114 criterion 1).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

// Stable across runs, so a re-run adopts the reservation rather than minting a second reference
// for the same seat. Any hash would do; this one is short enough to read back.
export function seedReference(slug: string): string {
  let hash = 2_166_136_261
  for (const character of slug) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0
  }
  let reference = ''
  for (let index = 0; index < RESERVATION_REFERENCE_LENGTH; index++) {
    reference += ALPHABET[hash % ALPHABET.length]
    hash = Math.floor(hash / ALPHABET.length) + index * 7919
  }
  return reference
}

type Status = 'PENDING' | 'COLLECTED' | 'DOOR' | 'EXPIRED' | 'CANCELLED' | 'NO_SHOW'

interface SeedReservation {
  slug: string
  performance: string
  // A booker slug, or nothing at all: guest checkout leaves no account behind (A-116).
  booker: string | null
  status: Status
  source: 'WEB' | 'DESK' | 'DOOR'
  seats: { type: string, count: number }[]
  cancelledBy?: 'CUSTOMER' | 'STAFF'
  customerNotes?: string
  staffNotes?: string
  // Whole days from now; a hold in the past is one the sweep has not reached yet.
  holdDays?: number
  refundSeats?: number
  windowBypassed?: true
}

const RESERVATIONS: SeedReservation[] = [
  // Tonight, which is the night every show-night screen opens on.
  { slug: 'tonight-collected', performance: 'the-seagull/tonight', booker: 'rowan', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 2 }] },
  { slug: 'tonight-collected-two', performance: 'the-seagull/tonight', booker: 'devon', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 1 }, { type: 'concession', count: 1 }] },
  { slug: 'tonight-collected-access', performance: 'the-seagull/tonight', booker: 'jonah', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'access', count: 1 }, { type: 'companion', count: 1 }], customerNotes: 'Wheelchair space, and my companion is with me.' },
  { slug: 'tonight-pending', performance: 'the-seagull/tonight', booker: 'mira', status: 'PENDING', source: 'WEB', seats: [{ type: 'standard', count: 2 }], holdDays: 0 },
  { slug: 'tonight-pending-stale', performance: 'the-seagull/tonight', booker: 'kavya', status: 'PENDING', source: 'WEB', seats: [{ type: 'concession', count: 1 }], holdDays: -1 },
  { slug: 'tonight-guest', performance: 'the-seagull/tonight', booker: null, status: 'PENDING', source: 'WEB', seats: [{ type: 'standard', count: 1 }], holdDays: 0 },
  { slug: 'tonight-door', performance: 'the-seagull/tonight', booker: 'noor', status: 'DOOR', source: 'DOOR', seats: [{ type: 'standard', count: 1 }] },
  { slug: 'tonight-walkup', performance: 'the-seagull/tonight', booker: 'bram', status: 'COLLECTED', source: 'DESK', seats: [{ type: 'standard', count: 1 }] },
  { slug: 'tonight-cancelled', performance: 'the-seagull/tonight', booker: 'ellis', status: 'CANCELLED', source: 'WEB', seats: [{ type: 'standard', count: 1 }], cancelledBy: 'CUSTOMER' },
  { slug: 'tonight-cancelled-staff', performance: 'the-seagull/tonight', booker: 'lapsed', status: 'CANCELLED', source: 'WEB', seats: [{ type: 'standard', count: 2 }], cancelledBy: 'STAFF', staffNotes: 'Duplicate order, the booker rang to say so.' },
  { slug: 'tonight-expired', performance: 'the-seagull/tonight', booker: 'unconfirmed', status: 'EXPIRED', source: 'WEB', seats: [{ type: 'standard', count: 1 }] },
  { slug: 'tonight-refunded', performance: 'the-seagull/tonight', booker: 'priya', status: 'COLLECTED', source: 'DESK', seats: [{ type: 'standard', count: 2 }], refundSeats: 1 },

  // Six seats and six sold, which is the house-full state.
  { slug: 'soldout-one', performance: 'an-inspector-calls/soldout', booker: 'rowan', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 2 }] },
  { slug: 'soldout-two', performance: 'an-inspector-calls/soldout', booker: 'aoife', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 2 }] },
  { slug: 'soldout-three', performance: 'an-inspector-calls/soldout', booker: 'sam', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'concession', count: 2 }] },

  // A night nobody has booked stays empty on purpose: new-writing-night/tonight-studio.

  // Over, so the no-show and the archive have something in them.
  { slug: 'past-attended', performance: 'the-seagull/past', booker: 'rowan', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 2 }] },
  { slug: 'past-noshow', performance: 'the-seagull/past', booker: 'tomasz', status: 'NO_SHOW', source: 'WEB', seats: [{ type: 'standard', count: 1 }] },
  { slug: 'yesterday-collected', performance: 'the-seagull/yesterday', booker: 'iris', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'concession', count: 3 }] },
  { slug: 'archive-collected', performance: 'the-crucible/archive-one', booker: 'sam', status: 'COLLECTED', source: 'DESK', seats: [{ type: 'standard', count: 2 }] },

  // To come, so a member's own bookings page shows something they can still cancel.
  { slug: 'next-week-pending', performance: 'the-seagull/next-week', booker: 'rowan', status: 'PENDING', source: 'WEB', seats: [{ type: 'standard', count: 2 }], holdDays: 6 },
  { slug: 'next-week-collected', performance: 'the-seagull/next-week', booker: 'devon', status: 'COLLECTED', source: 'WEB', seats: [{ type: 'standard', count: 1 }] },
  { slug: 'later-pending', performance: 'an-inspector-calls/later', booker: 'mira', status: 'PENDING', source: 'WEB', seats: [{ type: 'standard', count: 4 }], holdDays: 9 },
  // Booked past its own window by an officer, which is a flag a screen has to show (D-112).
  { slug: 'held-bypassed', performance: 'the-winters-tale/held', booker: 'noor', status: 'PENDING', source: 'DESK', seats: [{ type: 'standard', count: 2 }], holdDays: 3, windowBypassed: true },
]

export interface Bookings {
  // Reservation id by slug, and the ticket ids it holds, so the ledger can cite a real ticket.
  reservations: Map<string, { id: string, tickets: { id: string, typeSlug: string, price: number }[] }>
  counts: { reservations: number, tickets: number, refunded: number, discounts: number }
}

const DAY = 86_400

export function seedBookings(target: SeedTarget, people: People, programme: Programme, now: number): Bookings {
  const statements: BoundStatement[] = []
  const reservations: Bookings['reservations'] = new Map()
  let tickets = 0
  let refunded = 0

  for (const planned of RESERVATIONS) {
    const performance = programme.performances.get(planned.performance)
    if (!performance) throw new Error(`the seed has no performance "${planned.performance}"`)

    const id = seedId('reservation', planned.slug)
    const booker = planned.booker === null ? null : personIn(people, planned.booker).id

    statements.push(insert('reservations', {
      id,
      reference: seedReference(planned.slug),
      performance_id: performance.id,
      user_id: booker,
      status: planned.status,
      source: planned.source,
      hold_expires_at: planned.status === 'PENDING' && planned.holdDays !== undefined
        ? now + planned.holdDays * DAY + 3 * 3600
        : null,
      cancelled_by: planned.cancelledBy ?? null,
      customer_notes: planned.customerNotes ?? null,
      staff_notes: planned.staffNotes ?? null,
      window_bypassed: planned.windowBypassed ? 1 : 0,
    }))

    const held: { id: string, typeSlug: string, price: number }[] = []
    let seat = 0
    for (const seats of planned.seats) {
      const typeId = programme.ticketTypes.get(seats.type)
      if (!typeId) throw new Error(`the seed has no ticket type "${seats.type}"`)
      for (let index = 0; index < seats.count; index++) {
        const ticketId = seedId('ticket', planned.slug, seat)
        const price = priceOf(seats.type)
        statements.push(insert('tickets', {
          id: ticketId,
          reservation_id: id,
          performance_id: performance.id,
          ticket_type_id: typeId,
          price_paid: price,
          price_source: 'BASE',
          refunded_at: seat < (planned.refundSeats ?? 0) ? now - 2 * 3600 : null,
        }))
        if (seat < (planned.refundSeats ?? 0)) refunded++
        held.push({ id: ticketId, typeSlug: seats.type, price })
        tickets++
        seat++
      }
    }

    reservations.set(planned.slug, { id, tickets: held })
  }

  target.batch(statements)

  const discounts = seedDiscounts(target, people, now)
  return { reservations, counts: { reservations: RESERVATIONS.length, tickets, refunded, discounts } }
}

// The base prices from `programme.ts`, restated here because a ticket records what it charged
// rather than pointing at a price that may later move (D-120).
function priceOf(slug: string): number {
  return { standard: 700, concession: 500, access: 700, companion: 0, pass: 0, preview: 400 }[slug] ?? 0
}

// One live and one retired, so the discount screen shows both and the bar has one to apply.
function seedDiscounts(target: SeedTarget, people: People, now: number): number {
  const officer = personIn(people, 'rowan').id
  const rows: [string, string, number, string][] = [
    ['cast-and-crew', 'Cast and crew', 20, 'ACTIVE'],
    ['committee', 'Committee', 10, 'ACTIVE'],
    ['freshers-week', 'Freshers\' week', 50, 'RETIRED'],
  ]
  target.batch(rows.map(([slug, name, percent, status]) => insert('discounts', {
    id: seedId('discount', slug),
    name,
    percent,
    status,
    created_by: officer,
    updated_by: officer,
    created_at: now - 90 * DAY,
    updated_at: now - 90 * DAY,
  })))
  return rows.length
}
