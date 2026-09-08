// Opening a booking's QR link in a browser: the signed token in the URL is exchanged for a
// short-lived httpOnly cookie and never rendered again (D-108 criterion 4).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const reservationId = await verifyQrToken(token)
  if (!reservationId) return sendRedirect(event, '/qr?refused=invalid')

  setCookie(event, QR_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: QR_COOKIE_MAX_AGE_SECONDS,
  })
  return sendRedirect(event, '/qr')
})
