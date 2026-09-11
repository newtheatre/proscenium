import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, gte } from 'drizzle-orm'
import { refusalToCancel } from '#shared/utils/bookings'
import { londonDay, membershipState } from '#shared/utils/membership'
import { showNightOf } from '#shared/utils/show-night'
import type { MembershipState } from '#shared/utils/membership'
import type { MySummary } from '#shared/utils/my-summary'
import type { Availability } from '#shared/utils/programme'

// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun (CONTRIBUTING). Bun-safe only: the endpoint fetches training data itself and hands it in.

export interface NextRoomBooking {
  bookingId: string
  roomName: string
  startsAt: number
  endsAt: number
  purpose: string | null
  status: string
  userId: string
}

// The one upcoming room booking the tile shows. Bounded by LIMIT, not paged: one member's own row.
export async function nextRoomBooking(userId: string, now: number): Promise<NextRoomBooking | undefined> {
  const [row] = await db.select({
    bookingId: schema.roomBookings.id,
    roomName: schema.rooms.name,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    purpose: schema.roomBookings.purpose,
    status: schema.roomBookings.status,
    userId: schema.roomBookings.userId,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(and(eq(schema.roomBookings.userId, userId), gte(schema.roomBookings.endsAt, now)))
    .orderBy(asc(schema.roomBookings.startsAt))
    .limit(1)
  return row
}

export interface ActivePass {
  id: string
  typeName: string
  covers: string | null
  status: string
}

// Held passes with what they cover, which `server/utils/passes.ts`'s own reader does not carry
// (it answers the passes screen, not this tile).
export async function activePasses(userId: string): Promise<ActivePass[]> {
  return db.select({
    id: schema.passes.id,
    typeName: schema.passTypes.name,
    covers: schema.passTypes.description,
    status: schema.passes.status,
  })
    .from(schema.passes)
    .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passes.passTypeId))
    .where(and(eq(schema.passes.userId, userId), eq(schema.passes.status, 'ACTIVE')))
    .orderBy(desc(schema.passes.createdAt))
    .limit(10)
}

export interface OpenPassRequest {
  status: string
}

export async function openPassRequest(userId: string): Promise<OpenPassRequest | undefined> {
  const [row] = await db.select({ status: schema.passRequests.status })
    .from(schema.passRequests)
    .where(and(eq(schema.passRequests.userId, userId), eq(schema.passRequests.status, 'PENDING')))
    .orderBy(desc(schema.passRequests.createdAt))
    .limit(1)
  return row
}

export interface MySummaryShift {
  shiftId: string
  role: string
  status: string
  venueName: string
  showTitle: string
  startsAt: number
}

export interface MySummaryInputs {
  now: Date
  viewerId: string
  shift: MySummaryShift | null
  membershipTerm: { startsOn: string, expiresOn: string } | null
  membershipGraceDays: number
  claim: { status: string } | null
  room: NextRoomBooking | null
  trainingHeld: number
  trainingAvailable: number
  nextStep: { id: string, name: string } | null
  nextSession: { id: string, moduleName: string, heldOn: string, startsAt: string, place: string | null } | null
  passes: ActivePass[]
  passRequest: OpenPassRequest | null
  notifications: { id: string, title: string, link: string | null, createdAt: number }[]
  nextShow: { slug: string, title: string, performances: { startsAt: number, availability: Availability }[] } | null
}

function untilOf(state: MembershipState): string | null {
  return state.kind === 'current' || state.kind === 'grace' ? state.until : null
}

function claimWord(claim: { status: string } | null): 'open' | 'declined' | null {
  if (claim?.status === 'OPEN') return 'open'
  if (claim?.status === 'DECLINED') return 'declined'
  return null
}

// Pure: every field an already-shaped fact, nothing here reaches a database. What proves the
// allow-list, since a column that leaked in would have to leak in here (K-127 criterion 1).
export function assembleMySummary(input: MySummaryInputs): MySummary {
  const today = londonDay(input.now)
  const state = membershipState(input.membershipTerm, today, input.membershipGraceDays)
  const onShiftTonight = input.shift !== null
    && (input.shift.status === 'CLAIMED' || input.shift.status === 'CONFIRMED')
    && showNightOf(new Date(input.shift.startsAt * 1000)) === showNightOf(input.now)

  const nextShow = (() => {
    if (!input.nextShow || input.nextShow.performances.length === 0) return null
    const starts = input.nextShow.performances.map(performance => performance.startsAt)
    return {
      slug: input.nextShow.slug,
      title: input.nextShow.title,
      firstAt: Math.min(...starts),
      lastAt: Math.max(...starts),
      availability: input.nextShow.performances[0]!.availability,
    }
  })()

  return {
    onShiftTonight,
    shift: input.shift === null
      ? null
      : {
          shiftId: input.shift.shiftId,
          role: input.shift.role,
          showTitle: input.shift.showTitle,
          venueName: input.shift.venueName,
          startsAt: input.shift.startsAt,
          status: input.shift.status,
        },
    membership: { state: state.kind, until: untilOf(state), claim: claimWord(input.claim) },
    room: input.room === null
      ? null
      : {
          bookingId: input.room.bookingId,
          roomName: input.room.roomName,
          startsAt: input.room.startsAt,
          endsAt: input.room.endsAt,
          purpose: input.room.purpose,
          cancellable: refusalToCancel({ userId: input.room.userId, status: input.room.status }, input.viewerId) === null,
        },
    training: {
      held: input.trainingHeld,
      available: input.trainingAvailable,
      nextStep: input.nextStep,
      nextSession: input.nextSession,
    },
    passes: {
      active: input.passes.map(pass => ({ id: pass.id, typeName: pass.typeName, covers: pass.covers, status: pass.status })),
      request: input.passRequest ? { state: input.passRequest.status } : null,
    },
    notifications: input.notifications.slice(0, 3).map(item => ({ id: item.id, title: item.title, link: item.link, createdAt: item.createdAt })),
    nextShow,
  }
}
