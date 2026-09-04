import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { londonDayOf } from '#shared/utils/ledger'
import { says, variantEditForm } from '#shared/utils/bar'

// Edit a serving size. It does not move between products: its price series and its sales belong
// to the product it was sold under (F-112 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const input = await readValidatedBodyOrThrow(event, variantEditForm)

  // The serving kind is what a price resolves on, so a sold variant keeps the one it sold under.
  if (held.everSold && input.servingKind !== held.servingKind) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.label} has been sold, so its serving kind is fixed: add a new size instead`,
    })
  }

  const updated = await db.all<{ id: string }>(sql`
    UPDATE product_variants
    SET serving_kind = ${input.servingKind}, label = ${input.label}, sort = ${input.sort}
    WHERE id = ${id}
      AND NOT EXISTS (
        SELECT 1 FROM product_variants
        WHERE product_id = ${held.productId} AND serving_kind = ${input.servingKind} AND id <> ${id}
      )
    RETURNING id
  `)

  if (updated.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `This product already sells as a ${says(input.servingKind).toLowerCase()}`,
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.updated',
    target: `bar-variant:${id}`,
    detail: changes({
      servingKind: [held.servingKind, input.servingKind],
      label: [held.label, input.label],
      sort: [held.sort, input.sort],
    }),
  }))

  return { ok: true }
})
