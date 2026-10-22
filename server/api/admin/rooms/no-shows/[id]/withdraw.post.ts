import { and, count, eq, gt } from 'drizzle-orm'
import { releasedFromPreApproval, withdrawForm } from '#shared/utils/no-shows'

// Withdraw a no-show, by superseding it rather than editing it.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, withdrawForm)

  const [record] = await db.select({
    id: schema.roomNoShows.id,
    bookingId: schema.roomNoShows.bookingId,
    userId: schema.roomNoShows.userId,
    kind: schema.roomNoShows.kind,
  })
    .from(schema.roomNoShows)
    .where(eq(schema.roomNoShows.id, id))
    .limit(1)

  if (!record) throw noSuch('record')

  // Only the standing entry may be superseded: withdrawing one already withdrawn, or one an
  // earlier correction replaced, would leave two claims about the same night.
  const latest = await latestFor(record.bookingId)
  if (latest?.id !== record.id || record.kind !== 'RECORDED') {
    throw createError({ statusCode: 409, statusMessage: 'That record has already been superseded' })
  }

  const before = await standingOf(event, record.userId)
  const withdrawalId = newId()
  await db.insert(schema.roomNoShows).values({
    id: withdrawalId,
    bookingId: record.bookingId,
    userId: record.userId,
    kind: 'WITHDRAWN',
    reason: input.reason,
    supersedesId: record.id,
    recordedBy: account.id,
  })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.no-show.withdrawn',
    target: `booking:${record.bookingId}`,
    // The record it supersedes, never the words: a correction may name a person's circumstances.
    detail: { supersedes: record.id, record: withdrawalId },
  }))

  const after = await standingOf(event, record.userId)
  const released = releasedFromPreApproval(before.standing, after.standing)

  return {
    ok: true,
    id: withdrawalId,
    supersedes: record.id,
    ...after,
    released,
    userId: record.userId,
    // Their requests still to come, any of which may have waited on the ladder alone.
    waiting: released ? await waitingFor(record.userId) : 0,
  }
})

async function waitingFor(userId: string): Promise<number> {
  const [row] = await db.select({ waiting: count() })
    .from(schema.roomBookings)
    .where(and(
      eq(schema.roomBookings.userId, userId),
      eq(schema.roomBookings.status, 'PENDING_APPROVAL'),
      gt(schema.roomBookings.endsAt, Math.floor(Date.now() / 1000)),
    ))
  return row?.waiting ?? 0
}
