import { BOOKING_STATUSES, TIERS, saysBookingState } from './bookings'
import type { ListSpec } from './list-filters'

// A tier as the console reads it, from the value the booking stores.
export function saysTier(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase()
}

export type RowAction = 'bump' | 'record' | 'withdraw'

// The one thing a row may have done to it, by the routes' own rules: only a confirmed booking is
// bumped before it ends or marked after (C-115, C-116). The routes still decide.
export function rowActionFor(booking: { status: string, endsAt: number, noShowId: string | null }, now: number): RowAction | null {
  if (booking.noShowId) return 'withdraw'
  if (booking.status !== 'CONFIRMED') return null
  return booking.endsAt > now ? 'bump' : 'record'
}

// Every member's room bookings, as an officer reads them (K-129, C-115 criterion 6). A booking
// that has ended is hidden unless the officer asks, the same default closures use.
export const roomBookingsList = {
  key: 'room-bookings',
  search: { placeholder: 'A title, a member or a room', maxLength: 200 },
  fields: [
    {
      key: 'status',
      label: 'State',
      kind: 'list',
      column: 'status',
      options: BOOKING_STATUSES.map(status => ({ value: status, label: saysBookingState({ status }) })),
      cap: BOOKING_STATUSES.length,
      icon: 'i-lucide-circle-dot',
    },
    { key: 'room', label: 'Room', kind: 'search-list', column: 'room_id', icon: 'i-lucide-door-open' },
    { key: 'member', label: 'Member', kind: 'person', column: 'user_id', icon: 'i-lucide-user' },
    {
      key: 'tier',
      label: 'Kind of booking',
      kind: 'list',
      column: 'tier',
      options: TIERS.map(tier => ({ value: tier, label: saysTier(tier) })),
      cap: TIERS.length,
      icon: 'i-lucide-layers',
    },
    { key: 'startsAt', label: 'Starts', kind: 'date-range', column: 'starts_at', dateAs: 'unix', icon: 'i-lucide-calendar' },
    { key: 'past', label: 'Past', kind: 'yes-no', negated: 'Still to come', icon: 'i-lucide-history' },
    { key: 'noShow', label: 'Marked as a no-show', kind: 'yes-no', negated: 'Not marked', icon: 'i-lucide-user-x' },
  ],
  sort: {
    // `bookedOrder` breaks a tie between two bookings starting together: `id` is a random UUID.
    fields: [
      { key: 'startsAt', label: 'Starts', column: 'starts_at' },
      { key: 'bookedOrder', label: 'Booked order', column: 'rowid' },
    ],
    default: 'startsAt',
  },
} as const satisfies ListSpec
