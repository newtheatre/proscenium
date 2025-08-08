export default defineNuxtRouteMiddleware((_to) => {
  const { isLoggedIn } = useAuth()

  if (!isLoggedIn.value) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }
})
