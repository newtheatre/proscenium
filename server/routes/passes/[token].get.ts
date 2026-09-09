// Opening a pass's QR link in a browser: the signed token in the URL is exchanged for a
// short-lived httpOnly cookie and never rendered again, the same shape D-108's reservation link
// uses (server/routes/qr/[token].get.ts).
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
