import { asksNightAuthority } from '#shared/utils/night-shell'

// The shell's roles, awaited while the server renders a `/tonight` screen so the served page draws
// by them, and asked behind the page on a phone, where poor signal must never hold a navigation.
export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp = useNuxtApp()
  const hydrating = nuxtApp.isHydrating === true && nuxtApp.payload.serverRendered === true
  const ask = asksNightAuthority({ to: to.meta.layout, from: from.meta.layout, path: to.path, server: import.meta.server, hydrating })
  if (ask === 'await') await resolveNightAuthority()
  else if (ask === 'background') void resolveNightAuthority()
})
