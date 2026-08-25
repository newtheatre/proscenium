import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  unit: z.enum(schema.PRODUCT_UNITS).optional(),
  containerMl: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
  stockOnly: z.boolean().optional(),
  /** Replaces the whole recipe when present. Omit it to leave the recipe alone. */
  recipe: z.array(z.object({
    componentProductId: z.string().trim().min(1).nullable().optional(),
    choiceCategoryId: z.string().trim().min(1).nullable().optional(),
    qty: z.coerce.number().int().min(1).max(1_000_000),
  })).max(MAX_RECIPE_ITEMS).optional(),
  parQty: z.coerce.number().int().min(0).nullable().optional(),
  ageRestricted: z.boolean().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
  status: z.enum(schema.PRODUCT_STATUSES).optional(),
})

/** PATCH /api/admin/bar/products/:id. Edit or retire. Prices have their own route. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const product = await db.select({
    id: schema.barProducts.id,
    containerMl: schema.barProducts.containerMl,
    categoryId: schema.barProducts.categoryId,
    status: schema.barProducts.status,
  }).from(schema.barProducts).where(eq(schema.barProducts.id, id)).get()
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product.' })

  const catalogue = await depletionRules()
  const recipe = input.recipe ?? catalogue.get(id)?.recipe.map(item => ({
    componentProductId: item.componentProductId,
    choiceCategoryId: item.choiceCategoryId,
    qty: item.qty,
  })) ?? []

  if (input.stockOnly && recipe.length) {
    throw createError({ statusCode: 400, statusMessage: 'Something stock only holds its own stock. Clear its recipe first.' })
  }
  if (input.recipe) await assertRecipeIsSellable(id, input.recipe)

  // Something made of other things holds no stock, so it has no size.
  const containerMl = recipe.length
    ? null
    : input.containerMl === undefined ? product.containerMl : input.containerMl

  // Nor a par. The catalogue form hides the field once a recipe is set, so
  // without this a stale par survives and reads as permanently below par.
  const parQty = recipe.length ? null : input.parQty

  // Every movement is in the size that was current when it was written (ADR-0035).
  if (containerMl !== product.containerMl && await hasMovements(id)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This has stock movements against it, so its size is fixed. Retire it and add the new size as its own product.',
    })
  }

  // Status, category and recipe each decide whether this still holds stock for a
  // choice pool, so any of the three can empty one another recipe depends on.
  if (input.status || input.categoryId || input.recipe) {
    await assertChoicePoolsSurvive(catalogue, {
      id,
      categoryId: input.categoryId ?? product.categoryId,
      status: input.status ?? product.status,
      recipe,
    })
  }

  const { recipe: _replaced, ...fields } = input
  const statements: BatchItem<'sqlite'>[] = [
    db.update(schema.barProducts).set({ ...fields, containerMl, parQty }).where(eq(schema.barProducts.id, id)),
    ...(input.recipe ? recipeStatements(id, input.recipe) : []),
  ]

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { ok: true }
})
