// The leave link older waiting-list emails still carry: it opens the entry page, which names the
// list and leaves through a named confirmation (D-113 criterion 4, issue 1340).
export default defineEventHandler((event) => {
  const token = getRouterParam(event, 'token') ?? ''
  return sendRedirect(event, `/waiting-list/entry/${encodeURIComponent(token)}`, 301)
})
