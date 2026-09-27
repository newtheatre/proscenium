import { changes } from '#shared/utils/audit'
import { heldPricePointRefusal, passTypeForm } from '#shared/utils/pass-types'

// Edit a pass product: name, description, windows, price points and status. Covered shows move
// through their own endpoint, sometimes manager-gated (D-123 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await passTypeById(id)
  if (!held) throw noSuch('pass')

  const input = await readValidatedBodyOrThrow(event, passTypeForm)
  const description = input.description ?? null
  const salesOpenAt = input.salesOpenAt ?? null
  const salesCloseAt = input.salesCloseAt ?? null
  const maxIssued = input.maxIssued ?? null

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'pass-type.updated',
    target: `pass-type:${id}`,
    detail: {
      ...changes({
        slug: [held.slug, input.slug],
        name: [held.name, input.name],
        status: [held.status, input.status],
        validFrom: [held.validFrom, input.validFrom],
        validUntil: [held.validUntil, input.validUntil],
        salesOpenAt: [held.salesOpenAt, salesOpenAt],
        salesCloseAt: [held.salesCloseAt, salesCloseAt],
        maxIssued: [held.maxIssued, maxIssued],
      }),
      // Prose stays on the record; the trail records only that it moved (0011).
      descriptionChanged: description !== held.description,
    },
  })

  // The address and the price points an issued pass holds are both the write's own predicates
  // (0003); the price points follow behind its entry, kept by label and changed in place (0049).
  const updated = await auditedWrite(db.all<{ id: string }>(updatePassTypeStatement(id, {
    slug: input.slug,
    name: input.name,
    description,
    status: input.status,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    salesOpenAt,
    salesCloseAt,
    maxIssued,
    prices: input.prices,
  })), entry, ...priceUpsertStatements(id, input.prices, entry).map(statement => db.run(statement)))

  if (!updated) {
    const taken = await passTypeBySlug(input.slug, id)
    if (taken) throw createError({ statusCode: 409, statusMessage: `A pass already has the address ${taken.slug}` })
    const kept = await heldPricePointsRemoved(id, input.prices.map(price => price.label))
    if (kept.length > 0) throw createError({ statusCode: 409, statusMessage: heldPricePointRefusal(kept) })
    throw noSuch('pass')
  }

  return { ok: true }
})
