import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { archiveShowCategoryForm } from '#shared/utils/show-categories'

// Retire a show category, or bring it back. A retired category cannot be chosen for a new show
// and still names every show already carrying it (D-131 criteria 3 and 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showCategoryById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  const { archived } = await readValidatedBodyOrThrow(event, archiveShowCategoryForm)
  if (archived === held.archived) {
    throw createError({
      statusCode: 409,
      statusMessage: archived ? `${held.name} is already retired` : `${held.name} is not retired`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: archived ? 'show-category.archived' : 'show-category.restored',
    target: `show-category:${id}`,
    detail: changes({ archived: [held.archived, archived] }),
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`UPDATE show_categories SET archived = ${archived ? 1 : 0} WHERE id = ${id} AND archived = ${held.archived ? 1 : 0} RETURNING id`),
    entry,
  )

  if (!applied) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} changed while you were editing it` })
  }

  return { ok: true, archived }
})
