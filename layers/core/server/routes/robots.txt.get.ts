// What crawlers are asked to leave alone: every signed-in shell, the API, and a booking's own pages
// (basket, confirmation, order), which hold one person's booking. With the public site on, it
// points to the sitemap. Until the theatre says its site is ready (public-site.search.hidden), it
// disallows everything instead (C-42). A theatre that wants other rules puts a robots.txt in site/public.
import { bindings } from '#kit/bindings'
import { defineHandler, getRequestHeader, getRequestURL } from 'nuxt/server'
import { runInContext } from '#kit/context'
import { isEnabled, siteOrigin, useSetting } from '#kit'
import { SHELL_PREFIXES } from '../../shared/navigation'

const PRIVATE = [...Object.values(SHELL_PREFIXES), '/api/', '/book/basket', '/book/confirm/', '/book/order/', '/files/']

export default defineHandler(async (event) => {
  const env = bindings(event)
  if (!env?.DB) throw new Error('No DB binding on this request')
  return runInContext({ env, requestId: getRequestHeader(event, 'cf-ray') ?? crypto.randomUUID(), requestOrigin: getRequestURL(event).origin }, async () => {
    const site = await isEnabled('public-site')
    const hidden = site && await useSetting('public-site.search.hidden') === true
    const lines = ['User-agent: *', ...(hidden ? ['Disallow: /'] : PRIVATE.map(p => `Disallow: ${p}`))]
    if (site && !hidden) lines.push('', `Sitemap: ${await siteOrigin()}/sitemap.xml`)
    for (const [name, value] of Object.entries({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' })) event.res.headers.set(name, String(value)) // not-policy: an hour's caching for crawlers
    return `${lines.join('\n')}\n`
  })
})
