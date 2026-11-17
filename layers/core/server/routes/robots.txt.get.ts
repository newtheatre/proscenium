// What crawlers are asked to leave alone: every signed-in shell, the API, and a booking's own pages
// (basket, confirmation, order), which hold one person's booking. With the public site on, it
// points to the sitemap. A theatre that wants other rules puts a robots.txt in site/public.
import { defineEventHandler, getHeader, getRequestURL, setResponseHeaders } from 'h3'
import { runInContext } from '#kit/context'
import { isEnabled, siteOrigin } from '#kit'
import { SHELL_PREFIXES } from '../../shared/navigation'

const PRIVATE = [...Object.values(SHELL_PREFIXES), '/api/', '/book/basket', '/book/confirm/', '/book/order/', '/files/']

export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env
  if (!env?.DB) throw new Error('No DB binding on this request')
  return runInContext({ env, requestId: getHeader(event, 'cf-ray') ?? crypto.randomUUID(), requestOrigin: getRequestURL(event).origin }, async () => {
    const lines = ['User-agent: *', ...PRIVATE.map(p => `Disallow: ${p}`)]
    if (await isEnabled('public-site')) lines.push('', `Sitemap: ${await siteOrigin()}/sitemap.xml`)
    setResponseHeaders(event, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }) // not-policy: an hour's caching for crawlers
    return `${lines.join('\n')}\n`
  })
})
