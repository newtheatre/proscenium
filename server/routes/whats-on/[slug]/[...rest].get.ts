import { oldShowRedirect } from '#shared/utils/redirects'

// The pages under an old-site show address: the booking form to the show, a receipt to /qr (K-125).
export default defineEventHandler((event) => {
  const rest = (getRouterParam(event, 'rest') ?? '').split('/').filter(Boolean)
  return sendRedirect(event, oldShowRedirect(getRouterParam(event, 'slug') ?? '', rest), 301)
})
