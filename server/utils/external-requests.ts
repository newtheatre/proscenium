import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import { chunked } from '#shared/utils/approvals'
import { OPEN_STATUSES } from '#shared/utils/external-requests'
import type { ExternalStatus } from '#shared/utils/external-requests'

// Reading and answering an ask for a room we do not manage (C-120). Every write is guarded on the
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

// One over the cap, so a caller can say that more exist rather than reporting the cap as a total.
export const LIST_CAP = 200

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
    .limit(LIST_CAP + 1)
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

// Open first and soonest first, then the settled ones most recent first: the queue is a list of
// work, and an answered request from last term is a lookup, not the top of it.
export async function externalQueue(statuses: readonly ExternalStatus[]): Promise<RequestRow[]> {
  const open = sql.join(OPEN_STATUSES.map(status => sql`${status}`), sql`, `)
  const settled = sql`CASE WHEN ${schema.externalRequests.status} IN (${open}) THEN 0 ELSE 1 END`

  return selectRequests(
    inArray(schema.externalRequests.status, [...statuses]),
    sql`${settled}, CASE WHEN ${settled} = 0 THEN ${schema.externalRequests.startsAt} ELSE -${schema.externalRequests.startsAt} END`,
  )
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

// Every room offered, and whether it suited, for a page of requests at once. Without
// this the second answer overwrites the first and nobody can see that we asked again.
export async function assignmentsFor(requestIds: string[]): Promise<Map<string, AssignmentRow[]>> {
  const rows: (AssignmentRow & { requestId: string })[] = []
  for (const batch of chunked(requestIds)) rows.push(...await assignmentRows(batch))

  const byRequest = new Map<string, AssignmentRow[]>()
  for (const { requestId, ...row } of rows) {
    byRequest.set(requestId, [...(byRequest.get(requestId) ?? []), row])
  }
  return byRequest
}

async function assignmentRows(requestIds: string[]): Promise<(AssignmentRow & { requestId: string })[]> {
  if (requestIds.length === 0) return []

  return db.select({
    requestId: schema.externalAssignments.requestId,
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
    .where(inArray(schema.externalAssignments.requestId, requestIds))
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
