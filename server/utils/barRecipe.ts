import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq } from 'drizzle-orm'

/**
 * What a sold product is made of, and the rules a recipe has to obey before it
 * is written. Reasoning: ADR-0036.
 */

export const MAX_RECIPE_ITEMS = 8

export interface RecipeInput {
  componentProductId?: string | null
  choiceCategoryId?: string | null
  qty: number
}

/**
 * Refuses a recipe the till could not ring up. `productId` is null when the
 * product does not exist yet, which only skips the self-reference check.
 */
export async function assertRecipeIsSellable(productId: string | null, recipe: RecipeInput[]) {
  if (!recipe.length) return

  const catalogue = await depletionRules()
  const categories = new Set((await db.select({ id: schema.barCategories.id })
    .from(schema.barCategories)).map(c => c.id))

  // One level: something with a recipe cannot also be an ingredient (docs/13 §3.1).
  if (productId && [...catalogue.values()].some(p => p.recipe.some(i => i.componentProductId === productId))) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Something else is made from this, so it has to hold stock. Take it out of that recipe first.',
    })
  }

  for (const item of recipe) {
    if (!item.componentProductId === !item.choiceCategoryId) {
      throw createError({ statusCode: 400, statusMessage: 'An ingredient is either one product or a choice from one category, not both.' })
    }

    if (item.componentProductId) {
      if (item.componentProductId === productId) {
        throw createError({ statusCode: 400, statusMessage: 'A product cannot be an ingredient of itself.' })
      }
      const component = catalogue.get(item.componentProductId)
      if (!component) throw createError({ statusCode: 400, statusMessage: 'One of those ingredients does not exist.' })
      if (!isStockProduct(component)) {
        throw createError({ statusCode: 409, statusMessage: 'An ingredient has to hold its own stock. Point at the bottle, not at a measure of it.' })
      }
      continue
    }

    if (!categories.has(item.choiceCategoryId!)) {
      throw createError({ statusCode: 400, statusMessage: 'One of those categories does not exist.' })
    }
    const pool = choicePool(item.choiceCategoryId!, catalogue).filter(p => p.id !== productId)
    if (!pool.length) {
      throw createError({ statusCode: 409, statusMessage: 'That category holds nothing the till could pick. Put something stocked in it first.' })
    }
    // A pool counted two ways makes the recipe's figure mean two things.
    if (pool.some(p => (p.containerMl == null) !== (pool[0]!.containerMl == null))) {
      throw createError({
        statusCode: 409,
        statusMessage: 'That category mixes things counted in millilitres with things counted in items, so the amount would mean two things.',
      })
    }
  }
}

/**
 * Refuses an edit that would empty a live recipe's choice pool. One level cuts
 * both ways: a pool member is something another product is made from (ADR-0036).
 */
export async function assertChoicePoolsSurvive(
  catalogue: Map<string, CatalogueProduct>,
  after: { id: string, categoryId: string, status: (typeof schema.PRODUCT_STATUSES)[number], recipe: RecipeInput[] },
) {
  const before = catalogue.get(after.id)
  if (!before) return

  // Only whether it still holds its own stock matters here, so the recipe rows
  // are stand-ins: `choicePool` reads the length, the category and the status.
  const edited = new Map(catalogue)
  edited.set(after.id, {
    ...before,
    categoryId: after.categoryId,
    status: after.status,
    recipe: after.recipe.map(() => ({ id: '', componentProductId: null, choiceCategoryId: null, qty: 0 })),
  })

  for (const dependent of catalogue.values()) {
    if (dependent.id === after.id || dependent.status !== 'ACTIVE') continue
    for (const slot of dependent.recipe) {
      if (!slot.choiceCategoryId) continue
      // Only a pool this edit empties: one already empty is somebody else's fault.
      if (!choicePool(slot.choiceCategoryId, catalogue).length) continue
      if (choicePool(slot.choiceCategoryId, edited).length) continue

      const [named, category] = await Promise.all([
        db.select({ name: schema.barProducts.name }).from(schema.barProducts)
          .where(eq(schema.barProducts.id, dependent.id)).get(),
        db.select({ name: schema.barCategories.name }).from(schema.barCategories)
          .where(eq(schema.barCategories.id, slot.choiceCategoryId)).get(),
      ])
      throw createError({
        statusCode: 409,
        statusMessage: `${named?.name ?? 'Another product'} is made from a choice out of ${category?.name ?? 'that category'}, and this is the only thing stocked in it. Retire that product first, or stock something else in the category.`,
      })
    }
  }
}

/** Replaces a product's recipe wholesale: one statement per row (ADR-0006). */
export function recipeStatements(productId: string, recipe: RecipeInput[]): BatchItem<'sqlite'>[] {
  return [
    db.delete(schema.barRecipeItems).where(eq(schema.barRecipeItems.productId, productId)) as BatchItem<'sqlite'>,
    ...recipe.map((item, sort) => db.insert(schema.barRecipeItems).values({
      productId,
      componentProductId: item.componentProductId ?? null,
      choiceCategoryId: item.choiceCategoryId ?? null,
      qty: item.qty,
      sort,
    }) as BatchItem<'sqlite'>),
  ]
}
