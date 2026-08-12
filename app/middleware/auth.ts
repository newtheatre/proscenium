// Login is hosted by the central auth service (stage-door); bounce with the
// way back preserved. Dev uses the local /dev-login route.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    if (import.meta.dev) {
      return navigateTo('/dev-login', { external: true })
    }
    const config = useRuntimeConfig()
    const target = `${useRequestURL().origin}${to.fullPath}`
    return navigateTo(
      `${config.public.authBaseURL}/login?redirect=${encodeURIComponent(target)}`,
      { external: true },
    )
  }
})
