// What a search engine may hold, and how a page names itself (K-125). No imports, because
// nuxt.config.ts reads this file before any alias exists.

export const PRODUCTION_SITE_URL = 'https://newtheatre.org.uk'
export const SITE_NAME = 'Nottingham New Theatre'
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

// The auth and utility pages criterion 6 names, held apart so a test can name them too.
export const NOINDEX_PAGES = ['/sign-in', '/register', '/reset', '/verify', '/magic', '/qr', '/board']

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function robotsMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(escapeRegExp).join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path)
}

export const isCrawlable = (path: string): boolean => !ROBOTS_DISALLOW.some(pattern => robotsMatches(pattern, path))

// Indexable only at the production address: any other host serving this build is a duplicate.
// A development server indexes so its robots.txt and page meta can be read as production's.
export function siteIndexable(url: string | undefined, dev = false): boolean {
  if (dev) return true
  return (url ?? '').replace(/\/+$/, '') === PRODUCTION_SITE_URL
}

const bare = (text: string): string => text.replace(/^the\s+/i, '').trim().toLowerCase()

// "What's on | Nottingham New Theatre"; a title that is already the house's name stands alone.
export function titleFor(title: string | null | undefined, siteName = SITE_NAME): string {
  if (!title?.trim()) return siteName
  return bare(title) === bare(siteName) ? title : `${title} | ${siteName}`
}

// A poster is a blob under this prefix and is served at the same path; any other key is not.
export const POSTER_PREFIX = 'posters/'

export function posterUrl(posterKey: string | null | undefined): string | null {
  const key = (posterKey ?? '').replace(/^\/+/, '')
  return key.startsWith(POSTER_PREFIX) && key.length > POSTER_PREFIX.length ? `/${key}` : null
}
