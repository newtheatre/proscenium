import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  supplier: z.string().trim().min(1).max(120),
  /** `YYYY-MM-DD`. Defaults to today in Europe/London. */
  deliveredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceRef: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  lines: z.array(z.object({
    productId: z.string().trim().min(1),
    /** Whole units, not milli: three cases of twelve is entered as 36. */
    qtyUnits: z.coerce.number().min(0.001).max(100_000),
    costPencePerUnit: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  })).min(1).max(60),
})

/** POST /api/admin/bar/deliveries — stock in, with the movements it causes. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const rules = await depletionRules()
  for (const line of input.lines) {
    if (!rules.has(line.productId)) {
      throw createError({ statusCode: 400, statusMessage: 'One of those products no longer exists.' })
    }
  }

  const deliveryId = nanoid()
  const lines = input.lines.map(line => ({
    id: nanoid(),
    deliveryId,
    productId: line.productId,
    qtyMilli: Math.round(line.qtyUnits * 1000),
    costPencePerUnit: line.costPencePerUnit ?? null,
  }))
  const totalPence = lines.reduce(
    (sum, l) => sum + (l.costPencePerUnit == null ? 0 : Math.round((l.qtyMilli / 1000) * l.costPencePerUnit)),
    0,
  )

  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.stockDeliveries).values({
      id: deliveryId,
      supplier: input.supplier,
      deliveredOn: input.deliveredOn ?? londonDate(),
      invoiceRef: input.invoiceRef ?? null,
      notes: input.notes ?? null,
      totalPence: totalPence || null,
      receivedByUserId: user.id,
    }),
    // One statement per line: the parameter count must not grow with the delivery (ADR-0006).
    ...lines.map(l => db.insert(schema.stockDeliveryLines).values(l) as BatchItem<'sqlite'>),
    ...movementStatements(lines.map(l => ({
      productId: l.productId,
      qtyMilli: l.qtyMilli,
      kind: 'DELIVERY' as const,
      refTable: 'stock_delivery_lines',
      refId: l.id,
      costPencePerUnit: l.costPencePerUnit,
      createdByUserId: user.id,
    }))),
  ]

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { id: deliveryId, totalPence, lines: lines.length }
})
