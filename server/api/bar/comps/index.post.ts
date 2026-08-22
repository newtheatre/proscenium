import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    qty: z.coerce.number().int().min(1).max(99),
  })).min(1).max(40),
  reason: z.enum(schema.COMP_REASONS),
  note: z.string().trim().max(200).nullable().optional(),
})

/** POST /api/bar/comps: ask for a comp. Nothing is recorded until approved. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  const input = await readValidatedBody(event, bodySchema.parse)

  if (input.reason === 'OTHER' && !input.note) {
    throw createError({ statusCode: 400, statusMessage: 'Say what the comp is for.' })
  }

  const prices = await currentPrices(input.items.map(item => item.productId))
  const products = await depletionRules()
  const names = await db.select({ id: schema.barProducts.id, name: schema.barProducts.name })
    .from(schema.barProducts)

  const nameFor = new Map(names.map(n => [n.id, n.name]))
  const lines = input.items.map((item) => {
    const price = prices.get(item.productId)
    if (!price || !products.has(item.productId)) {
      throw createError({ statusCode: 409, statusMessage: 'One of those is no longer on the menu. Reload the till.' })
    }
    return {
      productId: item.productId,
      name: nameFor.get(item.productId) ?? 'Item',
      qty: item.qty,
      unitPricePence: price.pricePence,
      priceId: price.priceId,
    }
  })

  const session = await db.select({ id: schema.barSessions.id }).from(schema.barSessions)
    .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get()

  const [created] = await db.insert(schema.compRequests).values({
    barSessionId: session?.id ?? null,
    night,
    requestedByUserId: user.id,
    reason: input.reason,
    note: input.note ?? null,
    lines,
    grossPence: lines.reduce((total, line) => total + line.unitPricePence * line.qty, 0),
  }).returning({ id: schema.compRequests.id, requestedAt: schema.compRequests.requestedAt })

  return { id: created!.id, requestedAt: created!.requestedAt, expiresInMinutes: COMP_WINDOW_MINUTES }
})
