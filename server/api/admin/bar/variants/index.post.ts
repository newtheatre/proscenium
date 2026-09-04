import { sql } from 'drizzle-orm'
import { says, variantForm } from '#shared/utils/bar'

// Add a serving size to a product. A product holds each serving kind once, because the kind is
// what a category default resolves on (0017, F-121).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, variantForm)

  const product = await productById(input.productId)
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  const id = newId()

  // The predicate rides the write, so two managers adding the same size at once produce one
  // variant and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO product_variants (id, product_id, serving_kind, label, status, sort)
    SELECT ${id}, ${input.productId}, ${input.servingKind}, ${input.label}, 'ACTIVE', ${input.sort}
    WHERE NOT EXISTS (
      SELECT 1 FROM product_variants WHERE product_id = ${input.productId} AND serving_kind = ${input.servingKind}
    )
    RETURNING id
  `)

  if (created.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${product.name} already sells as a ${says(input.servingKind).toLowerCase()}`,
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.created',
    target: `bar-variant:${id}`,
    detail: { productId: input.productId, servingKind: input.servingKind, label: input.label },
  }))

  return { ok: true, id }
})
