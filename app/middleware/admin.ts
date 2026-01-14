export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  const isAdmin = user.value?.roles?.includes('ADMIN')

  if (!isAdmin) {
    return navigateTo('/')
  }
})
