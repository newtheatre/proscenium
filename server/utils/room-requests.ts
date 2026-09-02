import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import { dueToEscalate, dueToExpire } from '#shared/utils/requests'
import { formatLondon } from '#shared/utils/london'
import type { H3Event } from 'h3'

// A request nobody answers is told about once, and then lapses. The old app had neither, so one
// nobody saw stayed open indefinitely (C-108 criterion 3, audit RM-6).

export interface RequestSweep { escalated: number, expired: number }

// Whoever may act on a request. There is no approver role: it is whoever holds the permission,
// which C-109's queue reads the same way.
export async function approvers(): Promise<{ id: string, name: string }[]> {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('rooms.write'))
  if (roles.length === 0) return []

  const now = Math.floor(Date.now() / 1000)
  return db.selectDistinct({ id: schema.users.id, name: schema.users.name })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      inArray(schema.roleGrants.role, roles),
      sql`(${schema.roleGrants.expiresAt} IS NULL OR ${schema.roleGrants.expiresAt} > ${now})`,
      eq(schema.users.disabled, false),
    ))
}

// A cap, because the first sweep after the booking import could otherwise mail every approver
// once per historic open request in a single night. The same guard membership.ts carries.
const EXTERNAL_CHASE_CAP = 50

// An external request escalates but never expires: expiry frees a held slot, this holds none, so
// lapsing one would tell the member nothing while an answer may still come (C-120, 0036).
export async function sweepExternalRequests(event: H3Event | undefined, at = new Date()): Promise<number> {
  const now = Math.floor(at.getTime() / 1000)
  const escalateAfter = await configValue(event, 'ROOM_REQUEST_ESCALATE_HOURS')

  const waiting = await db.select({
    id: schema.externalRequests.id,
    who: schema.users.name,
    title: schema.externalRequests.title,
    startsAt: schema.externalRequests.startsAt,
    status: schema.externalRequests.status,
    createdAt: schema.externalRequests.createdAt,
    escalatedAt: schema.externalRequests.escalatedAt,
  })
    .from(schema.externalRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.externalRequests.userId))
    .where(and(
      inArray(schema.externalRequests.status, ['REQUESTED', 'AWAITING_EXTERNAL']),
      // Nobody is chased about a room whose date has passed: an imported history of open
      // requests is not a backlog anybody can act on.
      gte(schema.externalRequests.endsAt, now),
    ))
    .orderBy(asc(schema.externalRequests.createdAt))
    .limit(EXTERNAL_CHASE_CAP)

  let escalated = 0
  for (const request of waiting) {
    if (!dueToEscalate(request, now, escalateAfter)) continue

    await db.update(schema.externalRequests)
      .set({ escalatedAt: now })
      .where(eq(schema.externalRequests.id, request.id))

    for (const approver of await approvers()) {
      await notify(event, {
        type: 'external.request.waiting',
        userId: approver.id,
        context: {
          name: approver.name,
          who: request.who,
          title: request.title,
          when: whenOf(request),
          // Which half of the wait it is stuck in, because the two need different action.
          formIsIn: request.status === 'AWAITING_EXTERNAL',
          queueUrl: `${useRuntimeConfig(event).public.baseURL}/admin/su-requests`,
        },
      })
    }
    escalated++
  }

  return escalated
}

export async function sweepRequests(event: H3Event | undefined, at = new Date()): Promise<RequestSweep> {
  const now = Math.floor(at.getTime() / 1000)
  const escalateAfter = await configValue(event, 'ROOM_REQUEST_ESCALATE_HOURS')
  const expireAfter = await configValue(event, 'ROOM_REQUEST_EXPIRE_HOURS')

  const waiting = await db.select({
    id: schema.roomBookings.id,
    userId: schema.roomBookings.userId,
    room: schema.rooms.name,
    title: schema.roomBookings.title,
    startsAt: schema.roomBookings.startsAt,
    createdAt: schema.roomBookings.createdAt,
    escalatedAt: schema.roomBookings.escalatedAt,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(eq(schema.roomBookings.status, 'PENDING_APPROVAL'))
    .orderBy(asc(schema.roomBookings.createdAt))

  let escalated = 0
  let expired = 0

  for (const request of waiting) {
    // Expiry first: one that has waited past both ages lapses rather than being told it is late.
    if (dueToExpire(request, now, expireAfter)) {
      await expire(event, request, now)
      expired++
      continue
    }

    if (dueToEscalate(request, now, escalateAfter)) {
      await escalate(event, request, now)
      escalated++
    }
  }

  return { escalated, expired }
}

type Waiting = { id: string, userId: string, room: string, title: string, startsAt: number }

async function expire(event: H3Event | undefined, request: Waiting, now: number): Promise<void> {
  // Guarded on the status it read: an approver deciding at the same moment wins, and the sweep
  // leaves their decision alone (0006).
  const lapsed = await db.update(schema.roomBookings)
    .set({ status: 'REJECTED', rejectionReason: 'Nobody answered this in time, so it lapsed.', updatedAt: now })
    .where(and(eq(schema.roomBookings.id, request.id), eq(schema.roomBookings.status, 'PENDING_APPROVAL')))
    .returning({ id: schema.roomBookings.id })

  if (lapsed.length === 0) return

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: null,
    action: 'room.request.expired',
    target: `booking:${request.id}`,
    detail: { room: request.room },
  }))

  await notify(event, {
    type: 'room.request.expired',
    userId: request.userId,
    context: { name: '', room: request.room, title: request.title, when: whenOf(request) },
  })
}

async function escalate(event: H3Event | undefined, request: Waiting, now: number): Promise<void> {
  await db.update(schema.roomBookings)
    .set({ escalatedAt: now })
    .where(eq(schema.roomBookings.id, request.id))

  for (const approver of await approvers()) {
    await notify(event, {
      type: 'room.request.waiting',
      userId: approver.id,
      context: { name: approver.name, room: request.room, title: request.title, when: whenOf(request) },
    })
  }
}

function whenOf(request: { startsAt: number }): string {
  return formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
}
