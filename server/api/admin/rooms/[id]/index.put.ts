import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { roomForm, roomHoursForm } from '#shared/utils/rooms'
import type { BatchItem } from 'drizzle-orm/batch'

const body = roomForm.extend({
  // Absent means leave them alone; an empty array means the room is closed every day.
  hours: z.array(roomHoursForm).max(21).optional(),
})

// Change a room, its hours, or whether it is still in use.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  const before = await findRoom(id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such room' })

  const changes = roomChanges(before, input)
  const now = Math.floor(Date.now() / 1000)

  const writes: BatchItem<'sqlite'>[] = [
    db.update(schema.rooms)
      .set({
        name: input.name,
        description: input.description,
        capacity: input.capacity,
        isActive: input.isActive,
        sensitive: input.sensitive,
        isExternal: input.isExternal,
        campus: input.campus,
        building: input.building,
        contact: input.contact,
        minBookingMinutes: input.minBookingMinutes,
        maxBookingHours: input.maxBookingHours,
        noticeHours: input.noticeHours,
        horizonWeeks: input.horizonWeeks,
        activeBookingsCap: input.activeBookingsCap,
        updatedAt: now,
      })
      .where(eq(schema.rooms.id, id)),
  ]

  // Replaced wholesale: seven days is small enough that a diff would be more code than value.
  if (input.hours) {
    writes.push(db.delete(schema.roomHours).where(eq(schema.roomHours.roomId, id)))
    for (const day of input.hours) {
      writes.push(db.insert(schema.roomHours).values({ id: newId(), roomId: id, ...day }))
    }
  }

  const records: BatchItem<'sqlite'>[] = [
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'room.updated',
      target: `room:${id}`,
      detail: changes,
    })),
  ]
  if (input.hours) {
    records.push(db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'room.hours.set',
      target: `room:${id}`,
      // The days it is open, not the hours themselves: a diff of fourteen times reads as noise.
      detail: { open: input.hours.length, closed: 7 - new Set(input.hours.map(day => day.weekday)).size },
    })))
  }

  await db.batch([writes[0]!, ...writes.slice(1), ...records])

  return { ok: true, changed: Object.keys(changes) }
})
