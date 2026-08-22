import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { canManageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  reason: z.string().trim().max(200).nullable().optional(),
})

/** POST /api/bar/tabs/:id/void, taking a mis-tapped charge back off a tab. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which charge?' })

  const input = await readValidatedBody(event, body => bodySchema.parse(body ?? {}))

  const charge = await db.select({
    id: schema.transactions.id,
    tender: schema.transactions.tender,
    debtorUserId: schema.transactions.tabDebtorUserId,
    settledAt: schema.transactions.tabSettledAt,
    voidedAt: schema.transactions.voidedAt,
  }).from(schema.transactions).where(eq(schema.transactions.id, id)).get()

  if (!charge || charge.tender !== 'TAB') {
    throw createError({ statusCode: 404, statusMessage: 'No such tab charge.' })
  }
  if (charge.debtorUserId !== user.id && !canManageBar(user)) {
    throw createError({ statusCode: 403, statusMessage: 'That is not your tab.' })
  }
  if (charge.voidedAt) {
    throw createError({ statusCode: 409, statusMessage: 'That charge is already off the tab.' })
  }
  // Settled is money the reader really took, and a past day is already
  // reconciled against a Z-total. Reverse it as a refund, not a void (ADR-0031).
  if (charge.settledAt) {
    throw createError({ statusCode: 409, statusMessage: 'That one has been paid for. Ask the bar manager for a refund.' })
  }

  const reversals = await reversalMovementsFor(charge.id, user.id)

  await db.batch([
    // The two null checks live in the predicate, not just in the read above.
    db.update(schema.transactions)
      .set({ voidedAt: new Date(), voidedByUserId: user.id, voidReason: input.reason ?? 'Taken off the tab' })
      .where(and(
        eq(schema.transactions.id, charge.id),
        isNull(schema.transactions.voidedAt),
        isNull(schema.transactions.tabSettledAt),
      )),
    ...movementStatements(reversals),
  ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { ok: true, outstandingPence: await outstandingFor(charge.debtorUserId!) }
})
