// Nuxt Content's query and dump routes carry no auth of their own, so the signed-in
// documentation would otherwise be one anonymous GET away (J-109, 0076). Public help stays open (0093).
export default defineEventHandler(async (event) => {
  // The build prerenders the dump into an asset; wrangler routes that asset to the worker first.
  if (import.meta.prerender) return
  if (!needsSession(getRequestURL(event).pathname)) return
  await requireAccount(event)
})
