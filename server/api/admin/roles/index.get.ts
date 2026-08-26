// The roles an account currently holds, expiry enforced at read time.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'accounts.read')
  const userId = getQuery(event).userId
  if (typeof userId !== 'string' || !userId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request: userId' })
  }
  return { roles: await liveGrants(userId) }
})
