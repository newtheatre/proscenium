// Loads what other modules make of the public site (C-71 to C-73) before a public page renders, into
// core's usePublicShape. Staff screens have their own layouts and never ask.
export default defineNuxtPlugin(() => {
  addRouteMiddleware('public-site-shape', async (to) => {
    const shape = usePublicShape()
    if (shape.value || (to.meta.layout && to.meta.layout !== 'default')) return
    const empty = { frontPage: null, menu: [], footer: [] }
    shape.value = await useRequestFetch()<PublicShape>('/api/public-site/shape').catch(() => empty)
  }, { global: true })
})
