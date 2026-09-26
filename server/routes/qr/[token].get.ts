// Opening a booking's QR link in a browser: the signed token in the URL is exchanged for a
// short-lived httpOnly cookie and never rendered again (D-108 criterion 4).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const reservationId = await verifyQrToken(token)
  if (!reservationId) return sendRedirect(event, '/qr?refused=invalid')

  rememberQrToken(event, token)
  return sendRedirect(event, '/qr')
})
