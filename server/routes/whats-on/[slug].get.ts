import { oldShowRedirect } from '#shared/utils/redirects'

// An old-site show address answers 301 to the unified show page (K-125).
export default defineEventHandler(event =>
  sendRedirect(event, oldShowRedirect(getRouterParam(event, 'slug') ?? ''), 301))
