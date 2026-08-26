// Ends the session on this device only; revoking everywhere bumps the epoch instead (0007).
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
