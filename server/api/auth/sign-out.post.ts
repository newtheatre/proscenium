// Ends the session on this device only; revoking everywhere bumps the epoch instead (0007).
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  // A booking remembered on this device goes with the session (issue 1329).
  deleteCookie(event, QR_COOKIE_NAME, { path: '/' })
  return { ok: true }
})
