import { sql } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'
import { checkIdRefusal, productSetupForm, restrictedStockOf, setupItemIds } from '#shared/utils/bar'
import type { BatchItem } from 'drizzle-orm/batch'
import type { ServingKind, StockUnit } from '#shared/utils/bar'

// Set a whole product up in one submission (F-127). The batch is the transaction (0001, 0003), so
// a name lost to another manager writes nothing at all rather than half a product.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, productSetupForm)
  const today = londonDayOf(new Date())

  const category = await categoryById(input.product.categoryId)
  if (!category) throw noSuch('category')

  const named = setupItemIds(input)

  const held = named.length === 0
    ? []
    : (await db.all<{ id: string, name: string, status: string, unit: StockUnit, containerMl: number | null, ageRestricted: number }>(sql`
      SELECT id, name, status, unit, container_ml AS containerMl, age_restricted AS ageRestricted FROM bar_items
      WHERE id IN (${sql.join([...new Set(named)].map(id => sql`${id}`), sql`, `)})
    `)).map(item => ({ ...item, ageRestricted: item.ageRestricted === 1 }))

  if (held.length !== new Set(named).size) {
    throw noSuch('stocked item')
  }

  const poured = input.shape !== 'RECIPE' && input.item.mode === 'EXISTING' ? held[0]! : null

  // The form checks these for an item created here; an item chosen from the list carries its unit
  // in the database rather than in the payload, so the same two rules are re-applied against it.
  if (poured && input.shape !== 'RECIPE') {
    const item = poured
    const servings = input.shape === 'SIMPLE' ? [input.serving] : input.sizes
    if (item.unit === 'ML' && servings.some(serving => serving.servingKind === 'item')) {
      throw createError({
        statusCode: 409,
        statusMessage: `${item.name} is measured, so it sells by a measure: say the size and how much it pours`,
      })
    }
    if (item.containerMl && servings.some(serving => serving.qty > item.containerMl!)) {
      throw createError({
        statusCode: 409,
        statusMessage: `A serving cannot pour more than a ${item.name} holds`,
      })
    }
    if (item.status === 'RETIRED' && input.opening) {
      throw createError({
        statusCode: 409,
        statusMessage: `${item.name} is retired, so put it back before moving stock against it`,
      })
    }
  }

  // The product's switch follows what it pours, so a wine cannot go on the till with no Check ID
  // (F-106 criterion 5, F-111 criterion 6, issue 1299).
  const unchecked = checkIdRefusal(input.product, restrictedStockOf(input, held))
  if (unchecked) throw createError({ statusCode: 409, statusMessage: unchecked })

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

  const groupName = input.shape === 'RECIPE' ? input.choice?.group.name ?? null : null
  if (groupName) {
    const [group] = await db.all<{ name: string }>(sql`
      SELECT name FROM choice_groups WHERE name = ${groupName} COLLATE NOCASE LIMIT 1
    `)
    if (group) {
      throw createError({ statusCode: 409, statusMessage: `A choice group is already called ${group.name}` })
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
    pouredItem: poured,
    newId,
  })

  const statements: BatchItem<'sqlite'>[] = plan.statements.map(statement => db.run(statement))
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  const [written] = await db.all<{ id: string }>(sql`SELECT id FROM bar_products WHERE id = ${plan.productId}`)
  if (!written) {
    // Whichever name the racer took is the one to name back: the product's is often still free.
    const product = await claimName('product', input.product.name)
    if (product) {
      throw createError({ statusCode: 409, statusMessage: `A product is already called ${product.name}` })
    }
    if (input.shape !== 'RECIPE' && input.item.mode === 'NEW') {
      const item = await claimName('item', input.item.item.name)
      if (item) {
        throw createError({ statusCode: 409, statusMessage: `A stocked item is already called ${item.name}` })
      }
    }
    throw createError({
      statusCode: 409,
      statusMessage: `Something else took one of these names while ${input.product.name} was being set up: try again`,
    })
  }

  return { ok: true, id: plan.productId, status: plan.status, reason: plan.reason }
})
