// Nuxt Content's query and dump routes carry no auth of their own, so the signed-in
// documentation would otherwise be one anonymous GET away (J-109, 0076). The public collection stays open.
export default defineEventHandler(async (event) => {
  // The build prerenders the dump into an asset; wrangler routes that asset to the worker first.
  if (import.meta.prerender) return
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/__nuxt_content/docs/') && pathname !== '/dump.docs.sql') return
  await requireAccount(event)
})
