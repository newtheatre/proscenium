import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { archiveSeasonForm } from '#shared/utils/seasons'

// Retire a season, or bring it back. A retired season cannot be chosen for a new show and still
// names every show already carrying it (D-131 criteria 2 and 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await seasonById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such season' })

  const { archived } = await readValidatedBodyOrThrow(event, archiveSeasonForm)
  if (archived === held.archived) {
    throw createError({
      statusCode: 409,
      statusMessage: archived ? `${held.name} is already retired` : `${held.name} is not retired`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: archived ? 'season.archived' : 'season.restored',
    target: `season:${id}`,
    detail: changes({ archived: [held.archived, archived] }),
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`UPDATE seasons SET archived = ${archived ? 1 : 0} WHERE id = ${id} AND archived = ${held.archived ? 1 : 0} RETURNING id`),
    entry,
  )

  if (!applied) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} changed while you were editing it` })
  }

  return { ok: true, archived }
})
