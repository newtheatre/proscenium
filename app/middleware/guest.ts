export default defineNuxtRouteMiddleware((_to) => {
  const { isLoggedIn } = useAuth()

  if (isLoggedIn.value) {
    return navigateTo('/')
  }
})
