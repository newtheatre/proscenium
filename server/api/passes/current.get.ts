import { saysPrice } from '#shared/utils/ticket-types'

// The pass this browser opened most recently, read live (D-124 criterion 5, D-138). The cookie
// is the only credential this route asks for, the same shape D-108's reservation retrieval uses.
export default defineEventHandler(async (event) => {
  const [newest] = await rememberedPasses(event)
  if (!newest) throw createError({ statusCode: 401, statusMessage: 'Open the link from your pass email to see this' })
  const { passId, token } = newest

  const pass = await passCurrentState(passId)
  if (!pass) throw noSuch('pass')

  const url = `${useRuntimeConfig(event).public.baseURL}/passes/${token}`

  return {
    reference: pass.reference,
    passType: pass.passTypeName,
    priceLabel: pass.priceLabel,
    pricePaid: saysPrice(pass.pricePaid),
    status: pass.status,
    validFrom: pass.validFrom,
    validUntil: pass.validUntil,
    qrSvg: qrSvgBase64(url),
    // What booking ahead can use it for (D-135); booking itself needs the holder signed in.
    coveredShows: await passCoveredShows(passId, Math.floor(Date.now() / 1000)),
  }
})
