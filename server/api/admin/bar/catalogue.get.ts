import { db, schema } from '@nuxthub/db'
import { asc } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/catalogue: categories, products and today's prices. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const [categories, products, discounts] = await Promise.all([
    db.select().from(schema.barCategories).orderBy(asc(schema.barCategories.sort), asc(schema.barCategories.name)),
    db.select({
      id: schema.barProducts.id,
      categoryId: schema.barProducts.categoryId,
      name: schema.barProducts.name,
      unit: schema.barProducts.unit,
      containerMl: schema.barProducts.containerMl,
      stockOnly: schema.barProducts.stockOnly,
      parQty: schema.barProducts.parQty,
      status: schema.barProducts.status,
      sort: schema.barProducts.sort,
      ageRestricted: schema.barProducts.ageRestricted,
    }).from(schema.barProducts).orderBy(asc(schema.barProducts.sort), asc(schema.barProducts.name)),
    db.select().from(schema.barDiscounts)
      .orderBy(asc(schema.barDiscounts.sort), asc(schema.barDiscounts.name)),
  ])

  const [prices, recipeItems] = await Promise.all([
    currentPrices(products.map(p => p.id)),
    // The whole table, unparameterised: a bar menu is tens of rows (ADR-0006).
    db.select().from(schema.barRecipeItems).orderBy(asc(schema.barRecipeItems.sort)),
  ])
  const recipes = new Map<string, typeof recipeItems>()
  for (const item of recipeItems) {
    const existing = recipes.get(item.productId)
    if (existing) existing.push(item)
    else recipes.set(item.productId, [item])
  }

  return {
    categories,
    products: products.map(product => ({
      ...product,
      pricePence: prices.get(product.id)?.pricePence ?? null,
      recipe: recipes.get(product.id) ?? [],
    })),
    discounts,
  }
})
