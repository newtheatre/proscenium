// A pass's QR as a hosted PNG, the same shape as the booking one (D-124 criterion 5).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  if (!await verifyPassQrToken(token)) refuseQrImage()

  return sendQrImage(event, `${useRuntimeConfig(event).public.baseURL}/passes/${token}`)
})
