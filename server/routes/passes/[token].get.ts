// Opening a pass's QR link: the signed token is exchanged for a short-lived cookie and never
// rendered again, the same shape D-108's reservation link uses.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const passId = await verifyPassQrToken(token)
  if (!passId) return sendRedirect(event, '/passes?refused=invalid')

  rememberPassQrToken(event, token)
  return sendRedirect(event, '/passes')
})
