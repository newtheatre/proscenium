import { fromLondonWallClock } from './london'
import { saysDay } from './when'
import type { Availability } from './programme'

// The one shape `/my` reads (K-127 criterion 1): eight column allow-lists, nothing a tile does
// not show, so an identifier never rides along because a query happened to carry it.
export interface MySummary {
  onShiftTonight: boolean
  // Whether the shift the tile shows is tonight's: on shift at a bar opening is not next week's show.
  shiftIsTonight: boolean
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
  // The next booking still to come, opened through its own link route (issue 1332).
  ticket: { reference: string, showTitle: string, venueName: string, startsAt: number, url: string } | null
  notifications: { id: string, title: string, link: string | null, createdAt: number }[]
  nextShow: { slug: string, title: string, firstAt: number, lastAt: number, availability: Availability } | null
  // Live grants by title and London lapse day, null when permanent (A-119 criterion 6).
  roles: { role: string, lapsesOn: string | null }[]
}

// The tiles, in the order they stand when nothing is coming up (K-127 criterion 6).
export const MY_TILES = ['shift', 'room', 'tickets', 'training', 'membership', 'passes', 'notifications', 'show'] as const

export type MyTileName = (typeof MY_TILES)[number]

// Membership always says where it stands, so it is the one tile that never becomes a line.
export type MyThingName = Exclude<MyTileName, 'membership'>

// A session is a London wall clock, so it becomes an instant before it can sort against a shift's
// epoch seconds (0014).
function sessionAt(session: { heldOn: string, startsAt: string }): number {
  const [year, month, day] = session.heldOn.split('-').map(Number)
  const [hour, minute] = session.startsAt.split(':').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, day!, hour ?? 0, minute ?? 0).getTime() / 1000)
}

// The overview leads with what is soonest, then the standing order (K-127 criterion 6).
export function orderMyTiles(summary: MySummary): MyTileName[] {
  const soon = new Map<MyTileName, number>()
  if (summary.shift) soon.set('shift', summary.shift.startsAt)
  if (summary.room) soon.set('room', summary.room.startsAt)
  if (summary.ticket) soon.set('tickets', summary.ticket.startsAt)
  if (summary.training.nextSession) soon.set('training', sessionAt(summary.training.nextSession))

  const timely = [...soon.entries()]
    .sort((a, b) => a[1] - b[1] || MY_TILES.indexOf(a[0]) - MY_TILES.indexOf(b[0]))
    .map(([name]) => name)
  return [...timely, ...MY_TILES.filter(name => !soon.has(name))]
}

// A tile with nothing behind it. Membership always says where it stands, and a shift tile with no
// shift still leads to tonight while the member is on shift at a bar opening.
const EMPTY_WHEN: Record<MyThingName, (summary: MySummary) => boolean> = {
  shift: summary => !summary.shift && !summary.onShiftTonight,
  room: summary => !summary.room,
  tickets: summary => !summary.ticket,
  training: summary => summary.training.held === 0 && summary.training.available === 0
    && !summary.training.nextStep && !summary.training.nextSession,
  passes: summary => summary.passes.active.length === 0 && !summary.passes.request,
  notifications: summary => summary.notifications.length === 0,
  show: summary => !summary.nextShow,
}

const tileIsEmpty = (summary: MySummary, name: MyTileName): boolean => name !== 'membership' && EMPTY_WHEN[name](summary)

// The tiles with something behind them, soonest first, and the rest as one list in the standing
// order (K-127 criterion 6, issue 1153 item 3).
export function splitMyTiles(summary: MySummary): { tiles: MyTileName[], things: MyThingName[] } {
  return {
    tiles: orderMyTiles(summary).filter(name => !tileIsEmpty(summary, name)),
    things: MY_TILES.filter((name): name is MyThingName => name !== 'membership' && tileIsEmpty(summary, name)),
  }
}

// A line on the list: what would be there, and the one action that fills it.
export const MY_THINGS_TO_DO: Record<MyThingName, { says: string, label: string, to: string }> = {
  shift: { says: 'You have no shift claimed.', label: 'See open shifts', to: '/rota' },
  room: { says: 'You have no room booked.', label: 'Book a room', to: '/rooms' },
  tickets: { says: 'You have no bookings to come.', label: 'Book a show', to: '/whats-on' },
  training: { says: 'You have no training recorded yet.', label: 'See what we teach', to: '/training/modules' },
  passes: { says: 'You hold no pass.', label: 'See passes', to: '/account/passes' },
  notifications: { says: 'Nothing new has come in.', label: 'Choose what we email you about', to: '/account/notifications' },
  show: { says: 'Nothing is on sale yet.', label: 'See what\'s on', to: '/whats-on' },
}

// A-119 criterion 6: the day a role lapses, with its year since a grant can outrun this one.
export function saysRoleLapse(lapsesOn: string | null): string {
  return lapsesOn === null ? 'Until further notice' : `Lapses on ${saysDay(lapsesOn, { year: true })}`
}

// What the overview says about the reader's membership: a sentence, not a fragment hung off their
// name (copy-style, K-127 criterion 6).
export function saysMembershipSentence(membership: MySummary['membership']): string {
  if (membership.state === 'current') return `Your membership runs until ${saysDay(membership.until!, { year: true })}.`
  if (membership.state === 'grace') return `Your membership has run out. You can renew until ${saysDay(membership.until!, { year: true })}.`
  if (membership.state === 'lapsed') return 'Your membership has run out.'
  return 'You do not have a membership yet.'
}
