import { sql } from 'drizzle-orm'
import { publishShowForm } from '#shared/utils/programme'

// Publish a show, or take it back off the public site. Unpublishing closes sales through the sale
// predicate and touches no performance and no ticket (D-121 criteria 2 and 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const { published, cascadePerformances } = await readValidatedBodyOrThrow(event, publishShowForm)
  const status = published ? 'PUBLISHED' : 'DRAFT'
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: published ? `${held.title} is already published` : `${held.title} is not published`,
    })
  }

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
  ])

  return { ok: true, status, performancesTakenOnSale: cascaded }
})
