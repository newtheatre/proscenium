/** POST /api/auth/logout — end the current session. */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)

  return { message: 'Logout successful' }
})
