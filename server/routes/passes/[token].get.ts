// Opening a pass's QR link: the signed token is exchanged for a short-lived cookie and never
// rendered again, the same shape D-108's reservation link uses.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const passId = await verifyPassQrToken(token)
  if (!passId) return sendRedirect(event, '/passes?refused=invalid')

  setCookie(event, PASS_QR_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PASS_QR_COOKIE_MAX_AGE_SECONDS,
  })
  return sendRedirect(event, '/passes')
})
