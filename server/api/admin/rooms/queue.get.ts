import { EXTERNAL_STATUSES, OPEN_STATUSES } from '#shared/utils/external-requests'
import { inQueueOrder } from '#shared/utils/queue'
import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { z } from 'zod'
import type { QueueItem } from '#shared/utils/queue'
import type { H3Event } from 'h3'

const query = z.object({
  // Settled rows stay readable, so a decision can be looked up rather than remembered.
  when: z.enum(['open', 'all']).default('open'),
  kind: z.enum(['all', 'room', 'unlisted']).default('all'),
  room: z.string().max(64).optional(),
})

// Every room request, whoever manages the room.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, query)

  const ours = input.kind === 'unlisted' ? [] : await pendingRoomRequests(event, input.when, input.room)
  // A room filter names one of ours, so it excludes everything we do not manage by construction.
  const theirs = input.kind === 'room' || input.room ? [] : await unlistedRequests(event, input.when)

  const found = [...ours, ...theirs]
  const items = inQueueOrder(found).slice(0, LIST_CAP)

  return {
    when: input.when,
    kind: input.kind,
    items,
    total: items.length,
    more: found.length > LIST_CAP,
    counts: {
      room: found.filter(one => one.kind === 'room').length,
      unlisted: found.filter(one => one.kind === 'unlisted').length,
    },
  }
})

async function unlistedRequests(event: H3Event, when: 'open' | 'all'): Promise<QueueItem[]> {
  const rows = await externalQueue(when === 'open' ? OPEN_STATUSES : EXTERNAL_STATUSES)
  const notes = await notesFor({ spaceIds: rows.flatMap(one => (one.preferredSpaceId ? [one.preferredSpaceId] : [])) })
  const offers = await assignmentsFor(rows.map(one => one.id))

  return Promise.all(rows.map(async one => ({
    id: one.id,
    kind: 'unlisted' as const,
    userId: one.userId,
    requester: one.who,
    title: one.title,
    purpose: one.purpose,
    attendees: one.attendees,
    startsAt: one.startsAt,
    endsAt: one.endsAt,
    status: one.status,
    where: one.assigned ?? one.preferred,
    createdAt: one.createdAt,
    decidedAt: one.decidedAt,
    preferredSpaceId: one.preferredSpaceId,
    assignedSpaceId: one.assignedSpaceId,
    preferredWarning: warningFor(noteFor(notes, one.preferredSpaceId ?? '', one.purpose)),
    suReference: one.suReference,
    notes: one.notes,
    rejectionReason: one.rejectionReason,
    // The date it has to go in by, so the deadline belongs to whoever can meet it (C-121).
    formDueBy: one.status === 'REQUESTED' ? await formDeadline(event, one.startsAt) : null,
    offers: offers.get(one.id) ?? [],
  })))
}
