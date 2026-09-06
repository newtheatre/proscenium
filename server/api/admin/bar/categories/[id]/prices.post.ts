import { londonDayOf } from '#shared/utils/ledger'
import { categoryPriceForm } from '#shared/utils/bar'

// Set a category's default from a date, for one serving kind. Every change is a new row, so a
// same-day mistake is fixed today rather than tomorrow (F-121 criterion 1, F-116's same rule).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')
  const on = londonDayOf(new Date())

  const category = await categoryById(id)
  if (!category) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  const input = await readValidatedBodyOrThrow(event, categoryPriceForm)
  const priceId = newId()

  await db.insert(schema.categoryPrices).values({
    id: priceId,
    categoryId: id,
    servingKind: input.servingKind,
    pricePence: input.pricePence,
    effectiveFrom: input.effectiveFrom,
    createdBy: resolved.account.id,
  })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.category.price.set',
    target: `bar-category:${id}`,
    detail: { servingKind: input.servingKind, pricePence: input.pricePence, effectiveFrom: input.effectiveFrom },
  }))

  return { ok: true, id: priceId, effectiveNow: input.effectiveFrom <= on }
})
