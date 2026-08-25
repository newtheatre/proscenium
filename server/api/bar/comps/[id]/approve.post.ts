import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq, sql } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** POST /api/bar/comps/:id/approve: the approval writes the record. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!

  // Not requireBarScope: the duty manager approves without working the bar.
  const { night } = await requireFohScope(user)
  requireCompApprover(await mayApproveComps(user, night))

  const request = await db.select().from(schema.compRequests)
    .where(eq(schema.compRequests.id, id)).get()

  if (!request) throw createError({ statusCode: 404, statusMessage: 'That request no longer exists.' })
  if (request.night !== night) {
    throw createError({ statusCode: 409, statusMessage: 'That request is from another night.' })
  }
  if (request.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: `That request was already ${request.status.toLowerCase()}.` })
  }
  if (compExpired(request.requestedAt)) {
    throw createError({ statusCode: 409, statusMessage: 'That request has expired. Ask for it again.' })
  }

  const rules = await depletionRules()
  const depleting = request.lines.map((line) => {
    const product = rules.get(line.productId)
    if (!product) throw createError({ statusCode: 409, statusMessage: 'One of those is no longer on the menu.' })
    const resolved = resolveLine(product, line.qty, line.choices ?? [], rules)
    if (!resolved.ok) throw createError({ statusCode: 409, statusMessage: resolved.error })
    return resolved.line
  })

  // Claim the decision first: the read above is a round trip old, so without
  // this two approvers both write a COMP transaction and deplete stock twice.
  const [claimed] = await db.update(schema.compRequests).set({
    status: 'APPROVED',
    decidedByUserId: user.id,
    decidedAt: sql`(current_timestamp)`,
  }).where(and(
    eq(schema.compRequests.id, id),
    eq(schema.compRequests.status, 'PENDING'),
  )).returning({ id: schema.compRequests.id })

  if (!claimed) {
    throw createError({ statusCode: 409, statusMessage: 'That request has already been decided.' })
  }

  // Recorded as taken by the requester and approved by whoever is deciding.
  const built = buildTransaction({
    source: 'TILL',
    tender: 'COMP',
    takenByUserId: request.requestedByUserId,
    barSessionId: request.barSessionId,
    barLines: request.lines.map((line, i) => ({
      productId: line.productId,
      qty: line.qty,
      unitPricePence: line.unitPricePence,
      priceId: line.priceId,
      choices: depleting[i]!.choices,
    })),
    compReason: request.reason,
    compApprovedByUserId: user.id,
  })

  // The transaction is inserted before the request points at it: a batch runs
  // in order, so the other way round trips the foreign key.
  const statements: BatchItem<'sqlite'>[] = [
    ...built.statements,
    ...movementStatements(basketMovements(depleting, {
      kind: 'COMP',
      refTable: 'transactions',
      refId: built.transactionId,
      createdByUserId: user.id,
    })),
    db.update(schema.compRequests).set({
      transactionId: built.transactionId,
    }).where(eq(schema.compRequests.id, id)) as BatchItem<'sqlite'>,
  ]

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { id, status: 'APPROVED', transactionId: built.transactionId, approvedBy: user.name }
})
