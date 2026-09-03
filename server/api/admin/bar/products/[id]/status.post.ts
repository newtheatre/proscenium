import { eq } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { productStatusForm, says } from '#shared/utils/bar'

// Put a product on the till, hide it, or retire it. Retirement is one way, because a retired
// product is still what every historical line was sold as (F-111 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  const { status } = await readValidatedBodyOrThrow(event, productStatusForm)
  if (status === held.status) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} is already ${says(status).toLowerCase()}` })
  }

  if (held.status === 'RETIRED' && held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been sold, so it stays retired: add a new product rather than reviving this one`,
    })
  }

  if (status === 'ACTIVE') {
    const missing = await missingBeforeActive(id)
    if (missing.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `${held.name} cannot go on the till until it has ${missing.join(' and ')}`,
      })
    }
  }

  await db.batch([
    db.update(schema.barProducts).set({ status }).where(eq(schema.barProducts.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.product.status.changed',
      target: `bar-product:${id}`,
      detail: changes({ status: [held.status, status] }),
    })),
  ])

  return { ok: true, status }
})
