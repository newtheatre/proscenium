import { retireQuery } from '#shared/utils/rooms'
import { formatLondon } from '#shared/utils/london'
import type { Stranded } from '#server/utils/blackouts'

type Settled = Omit<Stranded, 'room'>

// Retire a room. Never a deletion: a booking made last term still names it (C-101 criterion 2).
// Asked to, it turns down what waits on it and cancels what is yet to start, in the same batch (0204).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await getValidatedQueryOrThrow(event, retireQuery)

  const room = await findRoom(id)
  if (!room) throw noSuch('room')
  if (!room.isActive) return { ok: true, alreadyRetired: true, turnedDown: 0, cancelled: 0 }

  const now = Math.floor(Date.now() / 1000)
  const reason = `${room.name} is no longer in use`
  const { audit, turnDown, cancel, retire } = retireStatements(
    { roomId: id, actorId: resolved.account.id, reason, now, ...input },
    auditEntry({
      actorId: resolved.account.id,
      action: 'room.updated',
      target: `room:${id}`,
      detail: changes({ isActive: [true, false] }),
    }),
  )

  const results = await db.batch([
    db.run(audit),
    ...(turnDown ? [db.all<Settled>(turnDown)] : []),
    ...(cancel ? [db.all<Settled>(cancel)] : []),
    db.run(retire),
  ] as unknown as Parameters<typeof db.batch>[0])

  const named = (rows: unknown): Stranded[] => (rows as Settled[]).map(row => ({ ...row, room: room.name }))
  const turnedDown = turnDown ? named(results[1]) : []
  const cancelled = cancel ? named(results[turnDown ? 2 : 1]) : []

  await repointSeries([...turnedDown, ...cancelled], now)
  await tellTurnedDown(event, turnedDown, reason)
  await tellStranded(event, cancelled, reason)

  return { ok: true, alreadyRetired: false, turnedDown: turnedDown.length, cancelled: cancelled.length }
})

// One message per member, the same one a decision in the queue sends (C-109 criterion 4).
async function tellTurnedDown(event: Parameters<typeof notify>[0], requests: Stranded[], reason: string): Promise<void> {
  const byMember = new Map<string, Stranded[]>()
  for (const request of requests) byMember.set(request.userId, [...(byMember.get(request.userId) ?? []), request])

  const base = useRuntimeConfig(event).public.baseURL
  for (const [userId, theirs] of byMember) {
    await notify(event, {
      type: 'room.request.rejected',
      userId,
      context: {
        name: '',
        bookings: theirs.map(request => ({
          room: request.room,
          title: request.title,
          when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        })),
        reason,
        moved: null,
        roomsUrl: `${base}/rooms/mine`,
      },
    })
  }
}
