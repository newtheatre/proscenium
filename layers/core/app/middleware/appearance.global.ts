// Public pages can be kept light whatever a person's mode (core.appearance.public-dark off). The
// colour-mode module forces a mode from the route's meta, on the server as well as in the browser,
// so the page is light from its first paint and the mode returns on leaving for a shell.
export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = (to.meta.layout ?? 'default') === 'default'
  const { data } = await usePublicSettings()
  if (isPublic && data.value['core.appearance.public-dark']?.value === false) to.meta.colorMode = 'light'
  else Reflect.deleteProperty(to.meta, 'colorMode')
})
