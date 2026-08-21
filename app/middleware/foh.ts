import { isStale } from '@newtheatre/auth-types'
import { canWorkFoh } from '~~/shared/utils/abilities'

// The show night screen. Holding the role gets you here; the rota decides what
// the page then shows, which is the server's business (ADR-0019).
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, session } = useUserSession()
  const config = useRuntimeConfig()
  const target = `${useRequestURL().origin}${to.fullPath}`

  if (!loggedIn.value) {
    if (import.meta.dev) {
      return navigateTo('/dev-login?staff=box-office', { external: true })
    }
    return navigateTo(
      `${config.public.authBaseURL}/login?redirect=${encodeURIComponent(target)}`,
      { external: true },
    )
  }

  if (!import.meta.dev && isStale(session.value)) {
    return navigateTo(
      `${config.public.authBaseURL}/api/session/refresh?redirect=${encodeURIComponent(target)}`,
      { external: true },
    )
  }

  if (!user.value || !canWorkFoh(user.value)) {
    return navigateTo('/')
  }
})
