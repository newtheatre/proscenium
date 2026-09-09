import { saysPrice } from '#shared/utils/ticket-types'

// The pass the exchanged cookie names, read live (D-124 criterion 5). The cookie is the only
// credential this route asks for, the same shape D-108's reservation retrieval uses.
export default defineEventHandler(async (event) => {
  const token = getCookie(event, PASS_QR_COOKIE_NAME)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Open the link from your pass email to see this' })

  const passId = await verifyPassQrToken(token)
  if (!passId) throw createError({ statusCode: 401, statusMessage: 'That link has expired. Open it again from your email' })

  const pass = await passCurrentState(passId)
  if (!pass) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const url = `${useRuntimeConfig(event).public.baseURL}/passes/${token}`

  return {
    reference: pass.reference,
    passType: pass.passTypeName,
    priceLabel: pass.priceLabel,
    pricePaid: saysPrice(pass.pricePaid),
    status: pass.status,
    qrSvg: qrSvgBase64(url),
  }
})
