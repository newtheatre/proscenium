import { requestPassForm } from '#shared/utils/passes'

// Criterion 3: a signed-in member requests a pass; it reserves nothing and admits nobody.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, requestPassForm)

  const passType = await passTypeForSale(input.passTypeId)
  if (!passType) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const refusal = passSaleRefusal(passType, Math.floor(Date.now() / 1000))
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const result = await requestPass(input.passTypeId, account.id)
  return { ok: true, id: result.id }
})
