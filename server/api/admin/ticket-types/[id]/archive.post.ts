import { eq } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { archiveTicketTypeForm } from '#shared/utils/ticket-types'

// Archive a ticket type, or take it back out. An archived type stops appearing for new sales and
// still resolves for every historical ticket, report and export (D-119 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await ticketTypeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such ticket type' })

  const { archived } = await readValidatedBodyOrThrow(event, archiveTicketTypeForm)
  if (archived === held.archived) {
    throw createError({
      statusCode: 409,
      statusMessage: archived ? `${held.name} is already archived` : `${held.name} is not archived`,
    })
  }

  await db.batch([
    db.update(schema.ticketTypes).set({ archived }).where(eq(schema.ticketTypes.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: archived ? 'ticket-type.archived' : 'ticket-type.restored',
      target: `ticket-type:${id}`,
      detail: changes({ archived: [held.archived, archived] }),
    })),
  ])

  return { ok: true, archived }
})
