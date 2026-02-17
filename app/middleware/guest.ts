export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (loggedIn.value) {
    const redirect = to.query.redirect as string | undefined
    return navigateTo(redirect || '/')
  }
})
