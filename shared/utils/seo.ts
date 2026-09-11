// What a search engine may hold, and how the site names itself (K-125). No imports, because
// nuxt.config.ts reads this file before any alias exists.

export const PRODUCTION_SITE_URL = 'https://newtheatre.org.uk'
export const SITE_NAME = 'Nottingham New Theatre'
export const SITE_ADDRESS = { addressLocality: 'Nottingham', addressCountry: 'GB' }
export const DEFAULT_OG_IMAGE = '/og-default.png'

// Everything behind an account, a shift or a token, and the transactional pages a crawler has
// no business holding. Robots syntax: a prefix, `*` anywhere, `$` to end the path exactly.
export const ROBOTS_DISALLOW = [
  '/account',
  '/admin',
  '/api',
  '/bar',
  '/board',
  '/book',
  '/box-office',
  '/comms',
  '/dev',
  '/docs',
  '/magic',
  '/money',
  '/my',
  '/passes',
  '/people',
  '/qr',
  '/register',
  '/reset',
  '/rooms',
  '/rota',
  '/sign-in',
  '/tonight',
  '/training$',
  '/training/catalogue',
  '/training/manage',
  '/training/sessions',
  '/verify',
  '/waiting-list',
]

// Indexable only when the request reached the production address: any other host serving this
// build is a duplicate. A development server indexes so its output can be read as production's.
export function siteIndexable(origin: string | undefined, dev = false): boolean {
  if (dev) return true
  return (origin ?? '').replace(/\/+$/, '').toLowerCase() === PRODUCTION_SITE_URL
}

// A poster is a blob under this prefix and is served at the same path. One segment per name, no
// dot-only segments, so a key can neither leave the prefix nor name a directory.
export const POSTER_PREFIX = 'posters/'
const POSTER_KEY = /^posters\/(?:[\w-]+(?:\.[\w-]+)*)(?:\/[\w-]+(?:\.[\w-]+)*)*$/

export const isPosterKey = (key: string): boolean => POSTER_KEY.test(key)

export function posterUrl(posterKey: string | null | undefined): string | null {
  const key = (posterKey ?? '').replace(/^\/+/, '')
  return isPosterKey(key) ? `/${key}` : null
}
