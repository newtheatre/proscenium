import { sql } from 'drizzle-orm'
import { newTicketTypeForm } from '#shared/utils/ticket-types'

// Add a ticket type. The name is global and held once, whatever the capitals.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, newTicketTypeForm)
  const id = newId()

  // The predicate rides the INSERT, so two officers naming the same thing at once produce one
  // type and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO ticket_types (id, name, description, price, kind, access_kind, archived, active_by_default)
    SELECT ${id}, ${input.name}, ${input.description ?? null}, ${input.price}, ${input.kind},
           ${input.accessKind ?? null}, 0, ${input.activeByDefault ? 1 : 0}
    WHERE NOT EXISTS (SELECT 1 FROM ticket_types WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await ticketTypeNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A ticket type is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'ticket-type.created',
    target: `ticket-type:${id}`,
    detail: { name: input.name, price: input.price, kind: input.kind, accessKind: input.accessKind ?? null },
  }))

  return { ok: true, id }
})
