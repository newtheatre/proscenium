import { saysQuantity } from '#shared/utils/bar'
import { applyStatements, stocktakeShortfalls } from '#server/utils/stocktakes'

// Post one adjustment movement per counted item whose count differs from what was expected, all
// in one transaction, and freeze the stocktake. A blank line writes nothing (F-115 criteria 4, 6).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.stocktake')

  const held = await stocktakeById(id)
  if (!held) throw noSuch('stocktake')
  if (held.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'This stocktake has already been applied' })
  }

  // No count goes in the audit detail: a concurrent count submission before the batch runs would
  // make one wrong, and audit_log cannot be corrected afterwards (0010).
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.stocktake.applied',
    target: `bar-stocktake:${id}`,
    detail: {},
  })

  // The UPDATE returns its own row as proof of winning (0003), and refuses a count that would
  // leave stock below zero on its own predicate, so a sale racing the apply cannot slip past (0126).
  const [freeze, audit, adjust] = applyStatements(id, resolved.account.id, entry)
  const [won, , posted] = await db.batch([
    db.all<{ id: string }>(freeze!),
    db.run(audit!),
    db.all<{ id: string }>(adjust!),
  ])

  if (won.length === 0) {
    const short = (await stocktakeById(id))?.status === 'OPEN' ? await stocktakeShortfalls(id) : []
    if (short.length > 0) {
      const named = short.map(line => `${line.itemName} at ${saysQuantity(line.after, line.unit)}`)
      throw createError({
        statusCode: 409,
        statusMessage: `Applying this would leave ${named.join(', ')}. More has gone out since those were counted than the count allows, so count them again.`,
      })
    }
    throw createError({ statusCode: 409, statusMessage: 'This stocktake has already been applied' })
  }

  return { ok: true, stocktake: await stocktakeById(id), adjustments: posted.length }
})
