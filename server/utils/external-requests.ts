import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import type { ExternalStatus } from '#shared/utils/external-requests'

// Reading and answering a member's ask for a union room (C-120). Every write is guarded on the
// status it read, so two officers acting at once cannot both count (0006).

export interface RequestRow {
  id: string
  userId: string
  who: string
  title: string
  purpose: string
  attendees: number | null
  startsAt: number
  endsAt: number
  preferredSpaceId: string | null
  preferred: string | null
  assignedSpaceId: string | null
  assigned: string | null
  notes: string | null
  suReference: string | null
  status: string
  submittedAt: number | null
  decidedAt: number | null
  rejectionReason: string | null
  createdAt: number
}

const preferred = alias(schema.externalSpaces, 'preferred_space')
const assigned = alias(schema.externalSpaces, 'assigned_space')

const COLUMNS = {
  id: schema.externalRequests.id,
  userId: schema.externalRequests.userId,
  who: schema.users.name,
  title: schema.externalRequests.title,
  purpose: schema.externalRequests.purpose,
  attendees: schema.externalRequests.attendees,
  startsAt: schema.externalRequests.startsAt,
  endsAt: schema.externalRequests.endsAt,
  preferredSpaceId: schema.externalRequests.preferredSpaceId,
  preferred: preferred.name,
  assignedSpaceId: schema.externalRequests.assignedSpaceId,
  assigned: assigned.name,
  notes: schema.externalRequests.notes,
  suReference: schema.externalRequests.suReference,
  status: schema.externalRequests.status,
  submittedAt: schema.externalRequests.submittedAt,
  decidedAt: schema.externalRequests.decidedAt,
  rejectionReason: schema.externalRequests.rejectionReason,
  createdAt: schema.externalRequests.createdAt,
}

// One chain, three callers: the joins that turn a request into something readable are the same
// whoever is asking, and a preference and an assignment are both spaces.
async function selectRequests(where: SQL | undefined, order: SQL): Promise<RequestRow[]> {
  return db.select(COLUMNS)
    .from(schema.externalRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.externalRequests.userId))
    .leftJoin(preferred, eq(preferred.id, schema.externalRequests.preferredSpaceId))
    .leftJoin(assigned, eq(assigned.id, schema.externalRequests.assignedSpaceId))
    .where(where)
    .orderBy(order)
    .limit(200)
}

export async function externalRequest(id: string): Promise<RequestRow | undefined> {
  const [row] = await selectRequests(eq(schema.externalRequests.id, id), asc(schema.externalRequests.startsAt))
  return row
}

export async function externalRequestsFor(userId: string, when: 'upcoming' | 'past', now: number): Promise<RequestRow[]> {
  return selectRequests(
    and(
      eq(schema.externalRequests.userId, userId),
      when === 'upcoming' ? gte(schema.externalRequests.endsAt, now) : lt(schema.externalRequests.endsAt, now),
    ),
    when === 'upcoming' ? asc(schema.externalRequests.startsAt) : desc(schema.externalRequests.startsAt),
  )
}

export async function externalQueue(statuses: readonly ExternalStatus[]): Promise<RequestRow[]> {
  return selectRequests(inArray(schema.externalRequests.status, [...statuses]), asc(schema.externalRequests.startsAt))
}

export interface AssignmentRow {
  id: string
  spaceId: string
  space: string
  outcome: string
  reason: string | null
  by: string | null
  recordedAt: number
}

// Every room the union offered, and whether it suited. Without this the second answer overwrites
// the first and nobody can see that we asked again, which is the spreadsheet all over again.
export async function assignmentsFor(requestId: string): Promise<AssignmentRow[]> {
  return db.select({
    id: schema.externalAssignments.id,
    spaceId: schema.externalAssignments.spaceId,
    space: schema.externalSpaces.name,
    outcome: schema.externalAssignments.outcome,
    reason: schema.externalAssignments.reason,
    by: schema.users.name,
    recordedAt: schema.externalAssignments.recordedAt,
  })
    .from(schema.externalAssignments)
    .innerJoin(schema.externalSpaces, eq(schema.externalSpaces.id, schema.externalAssignments.spaceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.externalAssignments.recordedBy))
    .where(eq(schema.externalAssignments.requestId, requestId))
    .orderBy(asc(schema.externalAssignments.recordedAt))
}

// Guarded on the status it read, and on nothing else: a route decides what may follow what, and
// the statement makes sure two officers cannot both act on the same step (0006).
export async function moveRequest(
  id: string,
  from: readonly ExternalStatus[],
  set: Record<string, unknown>,
): Promise<boolean> {
  const assignments = sql.join(
    Object.entries(set).map(([column, value]) => sql`${sql.identifier(column)} = ${value}`),
    sql`, `,
  )
  const states = from.map(status => sql`${status}`)

  const moved = await db.all<{ id: string }>(sql`
    UPDATE external_requests SET ${assignments}
    WHERE id = ${id} AND status IN (${sql.join(states, sql`, `)})
    RETURNING id
  `)

  return moved.length > 0
}
