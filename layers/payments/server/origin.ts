// The site's address as the Worker received the request, the same way the core's sign-in takes it:
// from the Worker's own request, never from forwarded headers. Cloudflare routes a request to this
// Worker by its host, so the host is one the site answers on. Null when there is no request (a job).
import { getRequestURL, type H3Event } from 'h3'

export function siteOrigin(event: H3Event): string {
  const request = event.web?.request ?? (event.context.cloudflare as { request?: Request } | undefined)?.request
  return (request ? new URL(request.url) : getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })).origin
}
