export default defineNuxtRouteMiddleware((_to) => {
  const { hasRole } = useAuth()

  if (!hasRole('ADMIN')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required',
    })
  }
})
