import { z } from 'zod'
import { roomForm, roomHoursForm } from '#shared/utils/rooms'

const body = roomForm.extend({
  hours: z.array(roomHoursForm).max(21).default([]),
})

// Add a room to the bookable estate.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rooms.write')
  const input = await readValidatedBodyOrThrow(event, body)

  const id = newId()
  await db.batch([
    db.insert(schema.rooms).values({
      id,
      name: input.name,
      description: input.description,
      capacity: input.capacity,
      isActive: input.isActive,
      sensitive: input.sensitive,
    }),
    ...input.hours.map(day => db.insert(schema.roomHours).values({ id: newId(), roomId: id, ...day })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'room.created',
      target: `room:${id}`,
      detail: { name: input.name, sensitive: input.sensitive },
    })),
  ])

  return { ok: true, id }
})
