import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { archiveVenueForm } from '#shared/utils/venues'

// Retire a venue, or bring it back. A retired venue cannot be chosen for a new performance and
// still serves every performance and record already pointing at it (D-131 criteria 1 and 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await venueById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

  const { archived } = await readValidatedBodyOrThrow(event, archiveVenueForm)
  if (archived === held.archived) {
    throw createError({
      statusCode: 409,
      statusMessage: archived ? `${held.name} is already retired` : `${held.name} is not retired`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: archived ? 'venue.archived' : 'venue.restored',
    target: `venue:${id}`,
    detail: changes({ archived: [held.archived, archived] }),
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`UPDATE venues SET archived = ${archived ? 1 : 0} WHERE id = ${id} AND archived = ${held.archived ? 1 : 0} RETURNING id`),
    entry,
  )

  if (!applied) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} changed while you were editing it` })
  }

  return { ok: true, archived }
})
