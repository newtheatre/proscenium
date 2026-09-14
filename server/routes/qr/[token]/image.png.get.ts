// The booking QR as a hosted PNG, encoding exactly the URL the email links to: Gmail's image
// proxy fetches this, because it renders neither a data: URI nor SVG (D-108 criterion 2).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  if (!await verifyQrToken(token)) refuseQrImage()

  return sendQrImage(event, `${useRuntimeConfig(event).public.baseURL}/qr/${token}`)
})
