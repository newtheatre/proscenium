import { requestPassForm } from '#shared/utils/passes'

// Criterion 3: a signed-in member requests a pass; it reserves nothing and admits nobody.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, requestPassForm)

  const passType = await passTypeForSale(input.passTypeId)
  if (!passType) throw noSuch('pass')

  const refusal = passSaleRefusal(passType, Math.floor(Date.now() / 1000))
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const result = await requestPass(input.passTypeId, account.id)
  if (!result.requested) {
    // Read after the write has already refused, only to say which of its two predicates did.
    const held = (await heldPasses(account.id)).some(pass => pass.passTypeId === input.passTypeId && pass.status === 'ACTIVE')
    throw createError({
      statusCode: 409,
      statusMessage: held
        ? 'You already hold this pass. Nothing more to ask for.'
        : 'You have already asked for this pass. Pay at the box office desk to collect it.',
    })
  }
  return { ok: true, id: result.id }
})
