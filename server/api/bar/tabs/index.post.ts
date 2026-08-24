import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { runBarTab } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    qty: z.coerce.number().int().min(1).max(20),
    choices: z.array(z.object({
      itemId: z.string().trim().min(1),
      productId: z.string().trim().min(1),
    })).max(8).optional().default([]),
  })).min(1).max(20),
  /** The figure the screen showed. Checked, not trusted (ADR-0023). */
  expectedTotalPence: z.coerce.number().int().min(0),
})

/** POST /api/bar/tabs, putting your own snack on your own tab. */
export default defineEventHandler(async (event) => {
  await authorize(event, runBarTab)

  const { user } = await requireUserSession(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  const ids = [...new Set(input.items.map(item => item.productId))]
  // Bound by the body's own 20-item cap, not by a result set (ADR-0006).
  const offered = await db.select({ id: schema.barProducts.id })
    .from(schema.barProducts)
    .where(and(
      inArray(schema.barProducts.id, ids),
      eq(schema.barProducts.status, 'ACTIVE'),
      eq(schema.barProducts.ageRestricted, false),
    ))
  const sellable = new Set(offered.map(product => product.id))
  for (const id of ids) {
    if (!sellable.has(id)) {
      throw createError({ statusCode: 403, statusMessage: 'That one is only sold at a staffed bar. Reload your tab.' })
    }
  }

  const prices = await currentPrices(ids)
  const barLines = input.items.map((item) => {
    const price = prices.get(item.productId)
    if (!price) throw createError({ statusCode: 409, statusMessage: 'One of those has no price set. Reload your tab.' })
    return { productId: item.productId, qty: item.qty, choices: item.choices, unitPricePence: price.pricePence, priceId: price.priceId }
  })

  const rules = await depletionRules()
  const depleting = barLines.map((line) => {
    const product = rules.get(line.productId)
    if (!product) throw createError({ statusCode: 409, statusMessage: 'One of those is no longer on the menu. Reload your tab.' })
    const resolved = resolveLine(product, line.qty, line.choices, rules)
    if (!resolved.ok) throw createError({ statusCode: 409, statusMessage: resolved.error })
    return resolved.line
  })

  // A tab outside a show night has no session, and that is fine.
  const night = showNightDate()
  const session = await db.select({ id: schema.barSessions.id }).from(schema.barSessions)
    .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get()

  const built = buildTransaction({
    source: 'SELF_SERVE',
    tender: 'TAB',
    takenByUserId: user.id,
    tabDebtorUserId: user.id,
    barSessionId: session?.id ?? null,
    // The picks the catalogue accepted, not what the client sent.
    barLines: barLines.map((line, i) => ({ ...line, choices: depleting[i]!.choices })),
  })

  if (built.totalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen showed ${formatPence(input.expectedTotalPence)} but this comes to ${formatPence(built.totalPence)}. Reload your tab.`,
    })
  }

  // The stock leaves the shelf now; the money follows when the tab is settled.
  const movements = movementStatements(basketMovements(depleting, {
    kind: 'SALE',
    refTable: 'transactions',
    refId: built.transactionId,
    createdByUserId: user.id,
  }))

  await db.batch([...built.statements, ...movements] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return {
    transactionId: built.transactionId,
    totalPence: built.totalPence,
    outstandingPence: await outstandingFor(user.id),
  }
})
