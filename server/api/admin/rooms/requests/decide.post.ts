import { eq } from 'drizzle-orm'
import { decisionForm } from '#shared/utils/approvals'
import { formatLondon } from '#shared/utils/london'
import type { DecisionOutcome, PendingRow } from '#server/utils/approvals'

// Approve or reject requests, one or a batch.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const input = await readValidatedBodyOrThrow(event, decisionForm)

  if (input.roomId) {
    const into = await findRoom(input.roomId)
    if (!into || !into.isActive) {
      throw createError({ statusCode: 422, statusMessage: 'That room is no longer bookable' })
    }
  }

  const now = Math.floor(Date.now() / 1000)
  // Read before deciding, because a rejected row no longer says who asked for it or when.
  const before = new Map((await pendingByIds(input.ids)).map(row => [row.id, row]))

  const outcomes: DecisionOutcome[] = []
  for (const id of input.ids) {
    outcomes.push(input.action === 'APPROVE'
      ? await approveOne(id, account.id, input.roomId, now)
      : await rejectOne(id, account.id, input.reason!, now))
  }

  const decided = outcomes.filter(outcome => outcome.ok)
  if (decided.length > 0) {
    await db.insert(schema.auditLog).values(decided.map(outcome => auditEntry({
      actorId: account.id,
      action: outcome.status === 'CONFIRMED' ? 'room.request.approved' : 'room.request.rejected',
      target: `booking:${outcome.id}`,
      // The room it went into, never the reason the member gave for asking (0011).
      detail: {
        room: input.roomId ?? before.get(outcome.id)?.roomId,
        ...(input.roomId ? { movedFrom: before.get(outcome.id)?.roomId } : {}),
      },
    })))
  }

  await tellRequesters(event, decided, before, input.action, input.reason, input.roomId)

  return {
    ok: outcomes.every(outcome => outcome.ok),
    decided: decided.length,
    outcomes,
  }
})

// One message per member per action, however many of their requests were in the batch: five
// decisions at once are five lines of one email, not five emails (criterion 4).
async function tellRequesters(
  event: Parameters<typeof notify>[0],
  decided: DecisionOutcome[],
  before: Map<string, PendingRow>,
  action: string,
  reason: string | null,
  intoRoom: string | null,
): Promise<void> {
  const movedTo = intoRoom ? await roomName(intoRoom) : null

  const byMember = new Map<string, { room: string, title: string, when: string }[]>()
  for (const outcome of decided) {
    const row = before.get(outcome.id)
    if (!row) continue
    const lines = byMember.get(row.userId) ?? []
    lines.push({
      room: movedTo ?? row.room,
      title: row.title,
      when: formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    })
    byMember.set(row.userId, lines)
  }

  for (const [userId, bookings] of byMember) {
    await notify(event, {
      type: action === 'APPROVE' ? 'room.request.approved' : 'room.request.rejected',
      userId,
      context: {
        name: '',
        bookings,
        reason,
        moved: movedTo,
        roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
      },
    })
  }
}

async function roomName(id: string): Promise<string | null> {
  const [room] = await db.select({ name: schema.rooms.name })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, id))
    .limit(1)
  return room?.name ?? null
}
