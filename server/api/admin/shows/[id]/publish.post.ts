import { sql } from 'drizzle-orm'
import { publishShowForm } from '#shared/utils/programme'

// Publish a show, or take it back off the public site. Unpublishing closes sales through the sale
// predicate and touches no performance and no ticket (D-121 criteria 2 and 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw noSuch('show')

  const { published, cascadePerformances, coverPassTypeIds } = await readValidatedBodyOrThrow(event, publishShowForm)
  const status = published ? 'PUBLISHED' : 'DRAFT'
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: published ? `${held.title} is already published` : `${held.title} is not published`,
    })
  }

  // Publishing onto a category or season retired after this show was drafted is new work, so it
  // refuses and names which, rather than publish against retired vocabulary (D-131 criterion 5).
  if (published) {
    const category = held.categoryId ? await showCategoryById(held.categoryId) : undefined
    if (category?.archived) {
      throw createError({ statusCode: 409, statusMessage: `${held.title} cannot publish: its category, ${category.name}, has been retired` })
    }
    const season = held.seasonId ? await seasonById(held.seasonId) : undefined
    if (season?.archived) {
      throw createError({ statusCode: 409, statusMessage: `${held.title} cannot publish: its season, ${season.name}, has been retired` })
    }
  }

  // Only a pass the sheet could offer may be ticked, and one already covering is left alone: the
  // additive action of D-123 criterion 4, never a removal (issue 1323).
  const offered = published && coverPassTypeIds.length ? await coveringPasses(id) : []
  for (const passTypeId of new Set(published ? coverPassTypeIds : [])) {
    if (offered.some(one => one.id === passTypeId)) continue
    const pass = await passTypeById(passTypeId)
    if (!pass) throw createError({ statusCode: 400, statusMessage: saysNoSuch('pass') })
    throw createError({ statusCode: 409, statusMessage: `${pass.name} is not on sale for ${held.title}'s dates, so it cannot cover it. Nothing has been published.` })
  }
  const covering = offered.filter(one => !one.covered && coverPassTypeIds.includes(one.id))

  // Draft performances only, so a cancelled one is never quietly put back on sale. Counted before
  // the batch because the statement's own row count is not read back.
  const cascading = published && cascadePerformances
  const [pending] = cascading
    ? await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM performances WHERE show_id = ${id} AND status = 'DRAFT'`)
    : [{ total: 0 }]
  const cascaded = Number(pending?.total ?? 0)

  await db.batch([
    db.run(sql`UPDATE shows SET status = ${status}, updated_at = unixepoch() WHERE id = ${id}`),
    ...(cascading ? [db.run(cascadeOnSaleQuery(id))] : []),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: published ? 'show.published' : 'show.unpublished',
      target: `show:${id}`,
      // Recorded on the unpublish too: it is what tells a reader the act left sold seats alone.
      detail: { performancesTakenOnSale: cascaded, soldTickets: held.soldTickets },
    })),
    ...covering.flatMap(pass => [
      db.insert(schema.passTypeShows).values({ id: newId(), passTypeId: pass.id, showId: id }).onConflictDoNothing(),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: resolved.account.id,
        action: 'pass-type.shows.updated',
        target: `pass-type:${pass.id}`,
        detail: { added: [id], removed: [] },
      })),
    ]),
  ])

  return { ok: true, status, performancesTakenOnSale: cascaded, passesCovering: covering.length }
})
