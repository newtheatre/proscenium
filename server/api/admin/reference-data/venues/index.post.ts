import { sql } from 'drizzle-orm'
import { venueForm } from '#shared/utils/venues'

// Add a venue. The name is held once, whatever the capitals (D-131 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, venueForm)
  const id = newId()

  // The predicate rides the INSERT, so two officers naming the same venue at once produce one
  // row and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO venues (id, name, address, capacity, is_external, image_key, description, room_id, archived, created_at)
    SELECT ${id}, ${input.name}, ${input.address ?? null}, ${input.capacity ?? null}, ${input.isExternal ? 1 : 0},
           NULL, ${input.description ?? null}, ${input.roomId ?? null}, 0, unixepoch()
    WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await venueNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A venue is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'venue.created',
    target: `venue:${id}`,
    detail: { name: input.name, isExternal: input.isExternal, roomId: input.roomId ?? null },
  }))

  return { ok: true, id }
})
