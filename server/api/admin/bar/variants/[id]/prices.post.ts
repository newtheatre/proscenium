import { londonDayOf } from '#shared/utils/ledger'
import { priceForm } from '#shared/utils/bar'

// Set a price from a date. Every change is a new row, including a correction, so a same-day
// mistake is fixed today rather than tomorrow (F-116 criteria 2 and 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')
  const on = londonDayOf(new Date())

  const variant = await variantById(id, on)
  if (!variant) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const input = await readValidatedBodyOrThrow(event, priceForm)
  const priceId = newId()

  await db.insert(schema.variantPrices).values({
    id: priceId,
    variantId: id,
    pricePence: input.pricePence,
    effectiveFrom: input.effectiveFrom,
    createdBy: resolved.account.id,
  })

  // The row is the record of the change, so the trail carries who set which price from when and
  // never a before value: the series already holds every one of those (0010).
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.price.set',
    target: `bar-variant:${id}`,
    detail: { pricePence: input.pricePence, effectiveFrom: input.effectiveFrom },
  }))

  return { ok: true, id: priceId, effectiveNow: input.effectiveFrom <= on }
})
