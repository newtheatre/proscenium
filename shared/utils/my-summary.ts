import { fromLondonWallClock } from './london'
import { saysDay } from './when'
import type { Availability } from './programme'

// The one shape `/my` reads (K-127 criterion 1): eight column allow-lists, nothing a tile does
// not show, so an identifier never rides along because a query happened to carry it.
export interface MySummary {
  onShiftTonight: boolean
  shift: { shiftId: string, role: string, showTitle: string, venueName: string, startsAt: number, status: string } | null
  membership: { state: 'current' | 'grace' | 'lapsed' | 'none', until: string | null, claim: 'open' | 'declined' | null }
  room: { bookingId: string, roomName: string, startsAt: number, endsAt: number, purpose: string | null, cancellable: boolean } | null
  training: {
    held: number
    available: number
    nextStep: { id: string, name: string } | null
    nextSession: { id: string, moduleName: string, heldOn: string, startsAt: string, place: string | null } | null
  }
  passes: {
    active: { id: string, typeName: string, covers: string | null, status: string }[]
    request: { state: string } | null
  }
  notifications: { id: string, title: string, link: string | null, createdAt: number }[]
  nextShow: { slug: string, title: string, firstAt: number, lastAt: number, availability: Availability } | null
}

// The tiles, in the order they stand when nothing is coming up (K-127 criterion 6). There is no
// tile for tickets: nothing answers a member's own bookings, and an empty tile would promise one.
export const MY_TILES = ['shift', 'room', 'training', 'membership', 'passes', 'notifications', 'show'] as const

export type MyTileName = (typeof MY_TILES)[number]

// A session is a London wall clock, so it becomes an instant before it can sort against a shift's
// epoch seconds (0014).
function sessionAt(session: { heldOn: string, startsAt: string }): number {
  const [year, month, day] = session.heldOn.split('-').map(Number)
  const [hour, minute] = session.startsAt.split(':').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, day!, hour ?? 0, minute ?? 0).getTime() / 1000)
}

// The overview leads with what is soonest, then the standing order (K-127 criterion 6). Every tile
// keeps its place either way: one with nothing behind it says what would fill it.
export function orderMyTiles(summary: MySummary): MyTileName[] {
  const soon = new Map<MyTileName, number>()
  if (summary.shift) soon.set('shift', summary.shift.startsAt)
  if (summary.room) soon.set('room', summary.room.startsAt)
  if (summary.training.nextSession) soon.set('training', sessionAt(summary.training.nextSession))

  const timely = [...soon.entries()]
    .sort((a, b) => a[1] - b[1] || MY_TILES.indexOf(a[0]) - MY_TILES.indexOf(b[0]))
    .map(([name]) => name)
  return [...timely, ...MY_TILES.filter(name => !soon.has(name))]
}

// What the overview says about the reader's membership: a sentence, not a fragment hung off their
// name (copy-style, K-127 criterion 6).
export function saysMembershipSentence(membership: MySummary['membership']): string {
  if (membership.state === 'current') return `Your membership runs until ${saysDay(membership.until!, { year: true })}.`
  if (membership.state === 'grace') return `Your membership has run out. You can renew until ${saysDay(membership.until!, { year: true })}.`
  if (membership.state === 'lapsed') return 'Your membership has run out.'
  return 'You do not have a membership yet.'
}
