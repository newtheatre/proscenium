// Our own rooms and the SU's: a week of bookings in every status, a repeating series, a recorded
// no-show, blackouts, and external requests at each step of the SU's own process.

import { fromLondonWallClock, londonParts } from '../../shared/utils/london'
import { ensure, holds, insert, insertOnly, seedId } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

interface SeedRoom {
  slug: string
  name: string
  capacity: number
  description: string
  sensitive: boolean
  hours?: { weekday: number, opens: string, closes: string }[]
}

const ROOMS: SeedRoom[] = [
  { slug: 'studio', name: 'The Studio', capacity: 40, description: 'The rehearsal room upstairs.', sensitive: false },
  { slug: 'workshop', name: 'The Workshop', capacity: 25, description: 'Bench space, and the only room with a sink.', sensitive: false },
  {
    slug: 'auditorium',
    name: 'The Auditorium',
    capacity: 120,
    description: 'The house. Booked around the season, so every request is agreed by a person.',
    sensitive: true,
    hours: [1, 2, 3, 4, 5, 6, 0].map(weekday => ({ weekday, opens: '09:00', closes: '23:00' })),
  },
  { slug: 'green-room', name: 'The Green Room', capacity: 12, description: 'Small, warm, and the only room with a kettle.', sensitive: false },
]

const SPACES: { slug: string, name: string, building: string, campus: string, capacity: number }[] = [
  { slug: 'portland-b12', name: 'Portland B12', building: 'Portland Building', campus: 'University Park', capacity: 20 },
  { slug: 'portland-a9', name: 'Portland A9', building: 'Portland Building', campus: 'University Park', capacity: 60 },
  { slug: 'hallward-3', name: 'Hallward Seminar 3', building: 'Hallward Library', campus: 'University Park', capacity: 15 },
  { slug: 'coates-c15', name: 'Coates C15', building: 'Coates Building', campus: 'University Park', capacity: 45 },
  { slug: 'trent-b6', name: 'Trent B6', building: 'Trent Building', campus: 'University Park', capacity: 30 },
]

interface SeedBooking {
  slug: string
  room: string
  booker: string
  title: string
  // Whole days from now, and the hour it starts at in London.
  days: number
  hour: number
  hours: number
  status: 'CONFIRMED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED' | 'BUMPED'
  purpose?: string
  tier?: string
  reason?: string
  rejectionReason?: string
  bumpedReason?: string
  attendees?: number
  noShow?: 'RECORDED' | 'WITHDRAWN'
}

const BOOKINGS: SeedBooking[] = [
  { slug: 'read-through', room: 'studio', booker: 'rowan', title: 'Read-through, The Seagull', days: 1, hour: 18, hours: 2, status: 'CONFIRMED', attendees: 14 },
  { slug: 'blocking-one', room: 'studio', booker: 'priya', title: 'Blocking, act one', days: 2, hour: 19, hours: 2, status: 'CONFIRMED', attendees: 9 },
  { slug: 'blocking-two', room: 'studio', booker: 'rowan', title: 'Blocking, act two', days: 3, hour: 19, hours: 2, status: 'CONFIRMED', attendees: 9 },
  { slug: 'set-build', room: 'workshop', booker: 'tomasz', title: 'Set build', days: 2, hour: 14, hours: 4, status: 'CONFIRMED', purpose: 'GET_IN', attendees: 6 },
  { slug: 'paint-call', room: 'workshop', booker: 'aoife', title: 'Paint call', days: 4, hour: 10, hours: 3, status: 'CONFIRMED', attendees: 4 },
  { slug: 'production-meeting', room: 'green-room', booker: 'devon', title: 'Production meeting', days: 1, hour: 17, hours: 1, status: 'CONFIRMED', purpose: 'MEETING', attendees: 8 },

  // Waiting on a person, so the approval queue is never empty (C-109).
  { slug: 'tech-rehearsal', room: 'auditorium', booker: 'sam', title: 'Technical rehearsal', days: 5, hour: 18, hours: 4, status: 'PENDING_APPROVAL', reason: 'The auditorium is the only room the set fits in.', attendees: 20 },
  { slug: 'emergency-paint', room: 'workshop', booker: 'priya', title: 'Emergency paint call', days: 1, hour: 9, hours: 3, status: 'PENDING_APPROVAL', reason: 'The flats have to be dry before the get-in on Saturday.', attendees: 3 },
  { slug: 'auditions', room: 'auditorium', booker: 'mira', title: 'Auditions, spring slot', days: 9, hour: 13, hours: 5, status: 'PENDING_APPROVAL', reason: 'Two panels running at once, so we need the seating.', attendees: 40 },

  // The refusals and the withdrawals, which a screen also has to render.
  { slug: 'refused-party', room: 'studio', booker: 'noor', title: 'End of run party', days: 12, hour: 20, hours: 4, status: 'REJECTED', purpose: 'SOCIAL', rejectionReason: 'The Studio is not licensed for this, and the SU bar is.' },
  { slug: 'cancelled-rehearsal', room: 'studio', booker: 'ellis', title: 'Movement call', days: 6, hour: 18, hours: 2, status: 'CANCELLED' },
  { slug: 'bumped-rehearsal', room: 'auditorium', booker: 'bram', title: 'Line run', days: 5, hour: 18, hours: 2, status: 'BUMPED', bumpedReason: 'Moved to make room for the technical rehearsal.' },

  // Over, so the archive and the no-show register have something in them.
  { slug: 'last-week', room: 'studio', booker: 'priya', title: 'Last week\'s rehearsal', days: -4, hour: 19, hours: 2, status: 'CONFIRMED' },
  { slug: 'no-show', room: 'green-room', booker: 'kavya', title: 'Committee catch-up', days: -3, hour: 17, hours: 1, status: 'CONFIRMED', purpose: 'MEETING', noShow: 'RECORDED' },
  { slug: 'no-show-withdrawn', room: 'workshop', booker: 'jonah', title: 'Props sort', days: -10, hour: 11, hours: 2, status: 'CONFIRMED', noShow: 'WITHDRAWN' },
]

export interface Spaces {
  rooms: Map<string, string>
  spaces: Map<string, string>
  counts: { rooms: number, spaces: number, bookings: number, requests: number, blackouts: number }
  feedTokens: { person: string, token: string }[]
}

export interface SpacesOptions { now: number, token: () => string }

export async function seedSpaces(target: SeedTarget, people: People, options: SpacesOptions): Promise<Spaces> {
  const { now, token } = options
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  const rooms = new Map<string, string>()
  for (const room of ROOMS) {
    const id = ensure(target, 'rooms', { column: 'name', value: room.name }, {
      id: seedId('room', room.slug),
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      sensitive: room.sensitive ? 1 : 0,
    }).id
    rooms.set(room.slug, id)

    for (const hours of room.hours ?? []) {
      statements.push(insert('room_hours', {
        id: seedId('roomhours', room.slug, hours.weekday),
        room_id: id,
        weekday: hours.weekday,
        opens: hours.opens,
        closes: hours.closes,
      }))
    }
  }

  const spaces = new Map<string, string>()
  for (const space of SPACES) {
    spaces.set(space.slug, ensure(target, 'external_spaces', { column: 'name', value: space.name }, {
      id: seedId('space', space.slug),
      name: space.name,
      building: space.building,
      campus: space.campus,
      capacity: space.capacity,
      contact: 'SU reception, room bookings desk',
    }).id)
  }

  // The lesson that cost somebody an evening, written down where the next person will read it
  // before booking rather than after (C-119).
  const notes: { space: string, purpose: string, verdict: string, reason: string }[] = [
    { space: 'portland-b12', purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills the room; there is no floor to work on.' },
    { space: 'portland-b12', purpose: 'MEETING', verdict: 'SUITABLE', reason: 'The table everybody complains about is the point here.' },
    { space: 'hallward-3', purpose: 'REHEARSAL', verdict: 'CAUTION', reason: 'Next to a silent study area, so nothing loud.' },
    { space: 'portland-a9', purpose: 'REHEARSAL', verdict: 'SUITABLE', reason: 'Sprung floor and a wall of mirrors. The best of them.' },
    { space: 'coates-c15', purpose: 'MEETING', verdict: 'CAUTION', reason: 'The heating cannot be turned down, so take the window seat.' },
  ]
  for (const note of notes) {
    statements.push(insert('external_space_notes', {
      id: seedId('spacenote', note.space, note.purpose),
      space_id: spaces.get(note.space)!,
      purpose: note.purpose,
      verdict: note.verdict,
      reason: note.reason,
      written_by: officer,
    }, '(space_id, purpose) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason'))
  }

  // The season closes the house, which is the only effect a venue's room attachment has (0043).
  const blackouts: { slug: string, room: string | null, reason: string, days: number, hours: number }[] = [
    { slug: 'get-in', room: 'auditorium', reason: 'Get-in and technical week for The Seagull', days: 0, hours: 12 },
    { slug: 'exam-period', room: null, reason: 'Examination period: the building is closed to bookings', days: 40, hours: 24 * 14 },
    { slug: 'floor-repair', room: 'studio', reason: 'Floor repair, contractors on site', days: 16, hours: 48 },
  ]
  for (const blackout of blackouts) {
    const from = now + blackout.days * DAY
    statements.push(insert('room_blackouts', {
      id: seedId('blackout', blackout.slug),
      room_id: blackout.room === null ? null : rooms.get(blackout.room)!,
      reason: blackout.reason,
      starts_at: from,
      ends_at: from + blackout.hours * 3600,
      created_by: officer,
    }))
  }

  target.batch(statements)

  const bookings = seedRoomBookings(target, people, rooms, now)
  const requests = seedExternalRequests(target, people, spaces, now)
  const feedTokens = await seedFeedTokens(target, people, token)

  return {
    rooms,
    spaces,
    counts: { rooms: ROOMS.length, spaces: SPACES.length, bookings, requests, blackouts: blackouts.length },
    feedTokens,
  }
}

// The wall-clock hour in London on a day offset from now, which is what a booking is agreed in.
// Built from the parts rather than an offset string, so it is right on both sides of the clocks.
function at(now: number, days: number, hour: number): number {
  const { year, month, day } = londonParts(new Date((now + days * DAY) * 1000))
  return Math.floor(fromLondonWallClock(year, month, day, hour).getTime() / 1000)
}

function londonDay(now: number, days: number): string {
  const { year, month, day } = londonParts(new Date((now + days * DAY) * 1000))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function seedRoomBookings(target: SeedTarget, people: People, rooms: Map<string, string>, now: number): number {
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  // A weekly series, so the repeat screens have a head booking to hang occurrences off (C-113).
  const seriesId = seedId('series', 'seagull-rehearsals')
  const headId = seedId('booking', 'series-1')
  statements.push(insert('room_series', {
    id: seriesId,
    user_id: officer,
    room_id: rooms.get('studio')!,
    title: 'The Seagull, weekly rehearsal',
    frequency: 'WEEKLY',
    weekdays: JSON.stringify([2]),
    starts_on: londonDay(now, 7),
    clock_from: '19:00',
    clock_to: '21:30',
    occurrences: 4,
    head_booking_id: headId,
  }))

  for (let occurrence = 1; occurrence <= 4; occurrence++) {
    const from = at(now, occurrence * 7, 19)
    statements.push(insert('room_bookings', {
      id: occurrence === 1 ? headId : seedId('booking', 'series', occurrence),
      room_id: rooms.get('studio')!,
      user_id: officer,
      title: 'The Seagull, weekly rehearsal',
      starts_at: from,
      ends_at: from + 2.5 * 3600,
      tier: 'REHEARSAL',
      purpose: 'REHEARSAL',
      status: 'CONFIRMED',
      series_id: seriesId,
      occurrence,
      attendees: 12,
    }))
  }

  for (const booking of BOOKINGS) {
    const from = at(now, booking.days, booking.hour)
    const id = seedId('booking', booking.slug)
    statements.push(insert('room_bookings', {
      id,
      room_id: rooms.get(booking.room)!,
      user_id: personIn(people, booking.booker).id,
      title: booking.title,
      attendees: booking.attendees ?? null,
      starts_at: from,
      ends_at: from + booking.hours * 3600,
      tier: booking.tier ?? 'REHEARSAL',
      purpose: booking.purpose ?? 'REHEARSAL',
      status: booking.status,
      reason: booking.reason ?? null,
      rejection_reason: booking.rejectionReason ?? null,
      bumped_reason: booking.bumpedReason ?? null,
      decided_by: booking.status === 'CONFIRMED' || booking.status === 'REJECTED' ? officer : null,
      decided_at: booking.status === 'CONFIRMED' || booking.status === 'REJECTED' ? now - 2 * DAY : null,
      no_show_recorded_at: booking.noShow === 'RECORDED' ? now - 2 * DAY : null,
    }))
  }

  target.batch(statements)

  // Append-only, so a re-run asks before it writes and a withdrawal supersedes rather than edits.
  const noShows: BoundStatement[] = []
  for (const booking of BOOKINGS.filter(candidate => candidate.noShow)) {
    const recordedId = seedId('noshow', booking.slug)
    if (holds(target, 'room_no_shows', { id: recordedId })) continue
    noShows.push(insertOnly('room_no_shows', {
      id: recordedId,
      booking_id: seedId('booking', booking.slug),
      user_id: personIn(people, booking.booker).id,
      kind: 'RECORDED',
      reason: 'The room was empty at twenty past and nobody had cancelled.',
      recorded_by: officer,
      recorded_at: now - 2 * DAY,
    }))
    if (booking.noShow === 'WITHDRAWN') {
      noShows.push(insertOnly('room_no_shows', {
        id: seedId('noshow', booking.slug, 'withdrawn'),
        booking_id: seedId('booking', booking.slug),
        user_id: personIn(people, booking.booker).id,
        kind: 'WITHDRAWN',
        reason: 'Withdrawn: the booker was in the workshop next door the whole time.',
        supersedes_id: recordedId,
        recorded_by: officer,
        recorded_at: now - 1 * DAY,
      }))
    }
  }
  if (noShows.length) target.batch(noShows)

  return BOOKINGS.length + 4
}

interface SeedRequest {
  slug: string
  requester: string
  title: string
  purpose: string
  days: number
  hour: number
  hours: number
  attendees: number
  preferred: string
  status: 'REQUESTED' | 'AWAITING_EXTERNAL' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'
  assigned?: string
  reference?: string
  rejectionReason?: string
  escalated?: true
  refusal?: { space: string, reason: string }
}

// Every step of a process we do not control, which is why each state has to render (C-116, C-117).
const REQUESTS: SeedRequest[] = [
  { slug: 'workshop-overflow', requester: 'rowan', title: 'Overflow rehearsal', purpose: 'REHEARSAL', days: 8, hour: 18, hours: 3, attendees: 18, preferred: 'portland-a9', status: 'REQUESTED' },
  { slug: 'committee-away-day', requester: 'iris', title: 'Committee away day', purpose: 'MEETING', days: 20, hour: 10, hours: 6, attendees: 14, preferred: 'coates-c15', status: 'AWAITING_EXTERNAL', escalated: true },
  { slug: 'audition-overflow', requester: 'mira', title: 'Audition overflow', purpose: 'REHEARSAL', days: 11, hour: 13, hours: 4, attendees: 25, preferred: 'portland-a9', status: 'CONFIRMED', assigned: 'portland-a9', reference: 'SU-2026-4471' },
  { slug: 'movement-workshop', requester: 'ellis', title: 'Movement workshop', purpose: 'REHEARSAL', days: 15, hour: 17, hours: 2, attendees: 12, preferred: 'hallward-3', status: 'REJECTED', rejectionReason: 'Hallward is not bookable by societies in term time.', refusal: { space: 'hallward-3', reason: 'Refused by the SU: not bookable by societies in term time.' } },
  { slug: 'withdrawn-social', requester: 'noor', title: 'Cast social', purpose: 'SOCIAL', days: 6, hour: 19, hours: 3, attendees: 20, preferred: 'trent-b6', status: 'CANCELLED' },
]

function seedExternalRequests(target: SeedTarget, people: People, spaces: Map<string, string>, now: number): number {
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  for (const request of REQUESTS) {
    const from = at(now, request.days, request.hour)
    const id = seedId('request', request.slug)
    const decided = request.status === 'CONFIRMED' || request.status === 'REJECTED'

    statements.push(insert('external_requests', {
      id,
      user_id: personIn(people, request.requester).id,
      title: request.title,
      purpose: request.purpose,
      attendees: request.attendees,
      starts_at: from,
      ends_at: from + request.hours * 3600,
      preferred_space_id: spaces.get(request.preferred)!,
      assigned_space_id: request.assigned ? spaces.get(request.assigned)! : null,
      su_reference: request.reference ?? null,
      status: request.status,
      submitted_at: request.status === 'REQUESTED' ? null : now - 5 * DAY,
      submitted_by: request.status === 'REQUESTED' ? null : officer,
      decided_at: decided ? now - 2 * DAY : null,
      decided_by: decided ? officer : null,
      rejection_reason: request.rejectionReason ?? null,
      escalated_at: request.escalated ? now - 1 * DAY : null,
    }))

    if (request.refusal) {
      statements.push(insert('external_assignments', {
        id: seedId('assignment', request.slug),
        request_id: id,
        space_id: spaces.get(request.refusal.space)!,
        outcome: 'REFUSED',
        reason: request.refusal.reason,
        recorded_by: officer,
        recorded_at: now - 2 * DAY,
      }))
    }
    if (request.assigned) {
      statements.push(insert('external_assignments', {
        id: seedId('assignment', request.slug, 'accepted'),
        request_id: id,
        space_id: spaces.get(request.assigned)!,
        outcome: 'ACCEPTED',
        reason: null,
        recorded_by: officer,
        recorded_at: now - 2 * DAY,
      }))
    }
  }

  target.batch(statements)
  return REQUESTS.length
}

// SHA-256 hex, the digest `server/utils/room-feed.ts` stores. The plaintext is generated per run
// and printed once, because a calendar URL is a bearer credential (C-114).
async function seedFeedTokens(
  target: SeedTarget,
  people: People,
  token: () => string,
): Promise<{ person: string, token: string }[]> {
  const issued: { person: string, token: string }[] = []
  const statements: BoundStatement[] = []

  for (const slug of ['rowan', 'priya']) {
    const person = personIn(people, slug)
    const id = seedId('feedtoken', slug)
    if (holds(target, 'room_feed_tokens', { id })) continue

    const plaintext = token()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext))
    statements.push(insert('room_feed_tokens', {
      id,
      user_id: person.id,
      token_hash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
    }))
    issued.push({ person: person.email, token: plaintext })
  }

  if (statements.length) target.batch(statements)
  return issued
}
