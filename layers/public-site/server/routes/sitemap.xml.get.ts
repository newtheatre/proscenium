// The sitemap search engines read (public site; C-47): the theatre's own pages from
// site/content/pages (less those kept from search engines), what's on and the archive, and every public production, venue and season.
// Past shows leave it while they are not public; with the public site off it is not found.
import { defineEventHandler, getHeader, getRequestURL, setResponseHeaders, setResponseStatus } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { runInContext } from '#kit/context'
import { isEnabled, siteOrigin, useSetting } from '#kit'
import { publicProgrammePaths } from '#modules/core'
import { productionBase } from '../shape'

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env
  if (!env?.DB) throw new Error('No DB binding on this request')
  return runInContext({ env, requestId: getHeader(event, 'cf-ray') ?? crypto.randomUUID(), requestOrigin: getRequestURL(event).origin }, async () => {
    if (!await isEnabled('public-site')) {
      setResponseStatus(event, 404) // not-policy: HTTP status
      return 'Not found'
    }
    const pastVisible = await useSetting('public-site.archive.public') as boolean
    // The collection's types are generated for the app only, so the server names it loosely.
    const pages = await queryCollection(event, 'pages' as never).select('path' as never, 'placeholder' as never, 'noindex' as never).all() as { path?: unknown, placeholder?: unknown, noindex?: unknown }[]
    const paths = [...new Set([
      ...pages.filter(p => p.placeholder !== true && p.noindex !== true).map(p => p.path).filter((p): p is string => typeof p === 'string' && p.startsWith('/')),
      '/whats-on',
      '/venues',
      ...(pastVisible ? ['/shows'] : []),
      ...await publicProgrammePaths({ pastVisible, productionBase: await productionBase() }),
    ])]
    const origin = await siteOrigin()
    setResponseHeaders(event, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }) // not-policy: an hour's caching for crawlers
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${escape(origin + p)}</loc></url>`).join('\n')}\n</urlset>\n`
  })
})
