import { asksNightAuthority } from '#shared/utils/night-shell'

// The shell's roles are asked before its first screen draws, so the served page already draws by
// them and hydration has nothing to redraw (issue 1521); within the shell, the answer stands.
export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp = useNuxtApp()
  const hydrating = nuxtApp.isHydrating === true && nuxtApp.payload.serverRendered === true
  if (!asksNightAuthority({ to: to.meta.layout, from: from.meta.layout, server: import.meta.server, hydrating })) return
  await resolveNightAuthority()
})
