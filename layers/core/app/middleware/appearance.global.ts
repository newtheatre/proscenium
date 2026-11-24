// Public pages can be kept light whatever a person's mode (core.appearance.public-dark off). The
// colour-mode module forces a mode from the route's meta, on the server as well as in the browser,
// so the page is light from its first paint and the mode returns on leaving for a shell. Live mode
// defaults to dark, since it is used in a dark auditorium and foyer, unless the person has picked a
// mode themselves in the account menu.
import { CHOSEN_KEY } from '../../shared/appearance'

export default defineNuxtRouteMiddleware(async (to) => {
  // The server decided the starting mode before the page rendered; the browser has the cookie only after.
  const decided = import.meta.server ? useRequestEvent()?.context.appearance as 'light' | 'dark' | 'system' | undefined : undefined
  if (decided) useColorMode().preference = decided
  if (to.meta.layout === 'live') {
    if (useCookie(CHOSEN_KEY).value) Reflect.deleteProperty(to.meta, 'colorMode')
    else to.meta.colorMode = 'dark'
    return
  }
  const isPublic = (to.meta.layout ?? 'default') === 'default'
  const { data } = await usePublicSettings()
  if (isPublic && data.value['core.appearance.public-dark']?.value === false) to.meta.colorMode = 'light'
  else Reflect.deleteProperty(to.meta, 'colorMode')
})
