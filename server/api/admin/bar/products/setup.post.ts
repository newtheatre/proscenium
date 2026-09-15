import { sql } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'
import { productSetupForm } from '#shared/utils/bar'
import type { BatchItem } from 'drizzle-orm/batch'
import type { ServingKind } from '#shared/utils/bar'

// Set a whole product up in one submission (F-127). The batch is the transaction (0001, 0003), so
// a name lost to another manager writes nothing at all rather than half a product.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, productSetupForm)
  const today = londonDayOf(new Date())

  const category = await categoryById(input.product.categoryId)
  if (!category) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  const named = input.shape === 'RECIPE'
    ? [...input.components.map(component => component.itemId),
        ...(input.choice?.group.options.map(option => option.itemId) ?? [])]
    : input.item.mode === 'EXISTING' ? [input.item.itemId] : []

  const held = named.length === 0
    ? []
    : await db.all<{ id: string, name: string, status: string }>(sql`
      SELECT id, name, status FROM bar_items WHERE id IN (${sql.join([...new Set(named)].map(id => sql`${id}`), sql`, `)})
    `)

  if (held.length !== new Set(named).size) {
    throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })
  }

  const taken = await claimName('product', input.product.name)
  if (taken) {
    throw createError({ statusCode: 409, statusMessage: `A product is already called ${taken.name}` })
  }

  if (input.shape !== 'RECIPE' && input.item.mode === 'NEW') {
    const item = await claimName('item', input.item.item.name)
    if (item) {
      throw createError({ statusCode: 409, statusMessage: `A stocked item is already called ${item.name}` })
    }
  }

  // Which serving kinds this category already prices today, so a size with no price of its own
  // still resolves one and the product may go on the till (F-121, 0017).
  const defaults = await db.all<{ servingKind: ServingKind }>(sql`
    SELECT DISTINCT serving_kind AS servingKind FROM category_prices
    WHERE category_id = ${input.product.categoryId} AND effective_from <= ${today}
  `)

  const plan = planProductSetup(input, {
    actorId: resolved.account.id,
    today,
    pricedKinds: defaults.map(row => row.servingKind),
    retiredItems: held.filter(item => item.status === 'RETIRED').map(item => item.name),
    newId,
  })

  const statements: BatchItem<'sqlite'>[] = plan.statements.map(statement => db.run(statement))
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  const [written] = await db.all<{ id: string }>(sql`SELECT id FROM bar_products WHERE id = ${plan.productId}`)
  if (!written) {
    const loser = await claimName('product', input.product.name)
    throw createError({
      statusCode: 409,
      statusMessage: `A product is already called ${loser?.name ?? input.product.name}`,
    })
  }

  return { ok: true, id: plan.productId, status: plan.status, reason: plan.reason }
})
