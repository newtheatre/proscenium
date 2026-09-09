import { issuePassForm } from '#shared/utils/passes'
import { saysPrice } from '#shared/utils/ticket-types'

// Sold at the desk, on the reader, under the same cross-check D-114 collection uses (criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, issuePassForm)

  const passType = await passTypeForSale(input.passTypeId)
  if (!passType) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const refusal = passSaleRefusal(passType, Math.floor(Date.now() / 1000))
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const price = await passTypePriceById(input.passTypePriceId)
  if (!price || price.passTypeId !== input.passTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'No such price point for this pass' })
  }

  if (price.price !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the desk now reads ${saysPrice(price.price)}. Nothing has been charged: check the price and try again.`,
    })
  }

  if (input.requestId) {
    const request = await passRequestById(input.requestId)
    if (!request || request.passTypeId !== input.passTypeId || request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'That request is no longer pending' })
    }
  }

  const result = await issuePass({
    passTypeId: input.passTypeId,
    passTypePriceId: input.passTypePriceId,
    maxIssued: passType.maxIssued,
    userId: input.userId,
    pricePaid: price.price,
    actorId: resolved.account.id,
    requestId: input.requestId,
  })

  if (!result.applied) {
    throw createError({ statusCode: 409, statusMessage: passCapReason(passType.maxIssued) ?? 'This pass could not be issued' })
  }

  await sendPassIssued(event, {
    userId: input.userId,
    reference: result.reference!,
    passTypeName: passType.name,
    priceLabel: price.label,
  }, result.passId!)

  return { ok: true, reference: result.reference, passId: result.passId }
})
