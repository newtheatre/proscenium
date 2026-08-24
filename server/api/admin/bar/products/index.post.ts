import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { manageBar } from '~~/shared/utils/abilities'

const recipeSchema = z.array(z.object({
  componentProductId: z.string().trim().min(1).nullable().optional(),
  choiceCategoryId: z.string().trim().min(1).nullable().optional(),
  /** In the ingredient's own basis: 25 for a single, 1 for a can of tonic. */
  qty: z.coerce.number().int().min(1).max(1_000_000),
})).max(MAX_RECIPE_ITEMS).optional().default([])

const bodySchema = z.object({
  categoryId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  unit: z.enum(schema.PRODUCT_UNITS).optional().default('each'),
  /** Millilitres in one container. Omit to count this in whole items. */
  containerMl: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
  /** Stocked but never sold, so it needs no price and reaches no till. */
  stockOnly: z.boolean().optional().default(false),
  /** What it is made of. Empty means it holds its own stock. */
  recipe: recipeSchema,
  parQty: z.coerce.number().int().min(0).nullable().optional(),
  ageRestricted: z.boolean().optional().default(true),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
  /** Pence. Creates the first date-effective price alongside the product. */
  pricePence: z.coerce.number().int().min(0).max(100_000).optional(),
}).superRefine((v, ctx) => {
  if (!v.stockOnly && v.pricePence == null) {
    ctx.addIssue({ code: 'custom', message: 'A price is needed unless this is stock only.', path: ['pricePence'] })
  }
  if (v.stockOnly && v.pricePence != null) {
    ctx.addIssue({ code: 'custom', message: 'Something stock only is never sold, so it has no price.', path: ['pricePence'] })
  }
  if (v.stockOnly && v.recipe.length) {
    ctx.addIssue({ code: 'custom', message: 'Something stock only holds its own stock, so it has no recipe.', path: ['recipe'] })
  }
})

/** POST /api/admin/bar/products: add something to sell, with its first price. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  await assertRecipeIsSellable(null, input.recipe)

  const { pricePence, recipe, ...product } = input
  const id = nanoid()

  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.barProducts).values({
      ...product,
      id,
      // Something made of other things holds no stock, so it has no size.
      containerMl: recipe.length ? null : input.containerMl ?? null,
    }),
    ...recipeStatements(id, recipe),
  ]
  if (pricePence != null) {
    statements.push(db.insert(schema.barPrices).values({
      productId: id,
      pricePence,
      effectiveFrom: pricingDate(),
      createdByUserId: user.id,
    }))
  }

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  const row = await db.select().from(schema.barProducts).where(eq(schema.barProducts.id, id)).get()
  return { ...row, pricePence: pricePence ?? null }
})
