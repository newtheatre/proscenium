import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { venueForm } from '#shared/utils/venues'

// Edit a venue. Retiring or bringing one back is its own action (D-131 criterion 6).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await venueById(id)
  if (!held) throw noSuch('venue')

  const input = await readValidatedBodyOrThrow(event, venueForm)
  const address = input.address ?? null
  const description = input.description ?? null
  const roomId = input.roomId ?? null

  // An external venue is staffed ad hoc, so its template goes in the same batch as the flag;
  // both read the flag as the batch leaves it, so a venue still ours keeps its template (E-101).
  const [templateAudit, templateDrop] = dropExternalTemplateStatements(id, auditEntry({
    actorId: resolved.account.id,
    action: 'shift-template.removed',
    target: `venue:${id}`,
  }))

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const [updated] = await db.batch([db.all<{ id: string }>(sql`
    UPDATE venues
    SET name = ${input.name},
        address = ${address},
        capacity = ${input.capacity ?? null},
        is_external = ${input.isExternal ? 1 : 0},
        description = ${description},
        room_id = ${roomId}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM venues WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `), db.run(templateAudit), db.run(templateDrop)])

  if (updated.length === 0) {
    const taken = await venueNamed(input.name, id)
    if (!taken) throw noSuch('venue')
    throw createError({ statusCode: 409, statusMessage: `A venue is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'venue.updated',
    target: `venue:${id}`,
    detail: changes({
      name: [held.name, input.name],
      capacity: [held.capacity, input.capacity ?? null],
      isExternal: [held.isExternal, input.isExternal],
      roomId: [held.roomId, roomId],
    }),
  }))

  return { ok: true }
})
