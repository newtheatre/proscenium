import { EXTERNAL_STATUSES, OPEN_STATUSES } from '#shared/utils/external-requests'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { inQueueOrder } from '#shared/utils/queue'
import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { roomsQueueList } from '#shared/utils/rooms-queue-list'
import type { QueueItem } from '#shared/utils/queue'
import type { H3Event } from 'h3'

const query = filterQuerySchema(roomsQueueList)

// Every room request, whoever manages the room, filtered by its declaration (K-129). The cap and
// the envelope stay bespoke: a queue is tens of rows, not a paged list.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, query)
  const conditions = conditionsOf(roomsQueueList, input)

  const when = (conditions.find(condition => condition.key === 'when')?.values[0] as 'open' | 'all' | undefined) ?? 'open'
  const kind = (conditions.find(condition => condition.key === 'kind')?.values[0] as 'all' | 'room' | 'unlisted' | undefined) ?? 'all'
  const room = conditions.find(condition => condition.key === 'room')?.values[0]

  const ours = kind === 'unlisted' ? [] : await pendingRoomRequests(event, when, room)
  // A room filter names one of ours, so it excludes everything we do not manage by construction.
  const theirs = kind === 'room' || room ? [] : await unlistedRequests(event, when)

  const found = [...ours, ...theirs]
  const items = inQueueOrder(found).slice(0, LIST_CAP)

  return {
    when,
    kind,
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
    convertedToBookingId: one.convertedToBookingId,
    // The date it has to go in by, so the deadline belongs to whoever can meet it (C-121).
    formDueBy: one.status === 'REQUESTED' ? await formDeadline(event, one.startsAt) : null,
    offers: offers.get(one.id) ?? [],
  })))
}
