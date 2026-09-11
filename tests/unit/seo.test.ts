import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { matchPathToRule } from '@nuxtjs/robots/util'
import { OLD_SITE_REDIRECTS, oldShowRedirect } from '#shared/utils/redirects'
import {
  DEFAULT_OG_IMAGE,
  PRODUCTION_SITE_URL,
  ROBOTS_DISALLOW,
  isPosterKey,
  posterUrl,
  siteIndexable,
} from '#shared/utils/seo'
import { CONSOLE_HOME, CONSOLE_NAV, MEMBER_NAV, PUBLIC_NAV, SHELL_NAV } from '#shared/utils/site-nav'

// K-125: the crawl list is held against the navigation declaration (0040) with the robots
// module's own matcher, so a screen cannot be indexed, or hidden, by accident.

const PAGES = 'app/pages'

const RULES = ROBOTS_DISALLOW.map(pattern => ({ pattern, allow: false }))
const isCrawlable = (path: string): boolean => matchPathToRule(path, RULES) === null

function pageFiles(): string[] {
  return [...new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES, onlyFiles: true })].sort()
}

// The route a page file serves, by Nuxt's own conventions, with a sample value for each parameter.
function routeOf(file: string): string {
  const route = file.replace(/\.vue$/, '').replace(/\/index$/, '').replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'x')
  return `/${route === 'index' ? '' : route}`.replace(/\/$/, '') || '/'
}

function contentRoutes(): Set<string> {
  return new Set([...new Bun.Glob('**/*.md').scanSync({ cwd: 'content', onlyFiles: true })]
    .filter(entry => !entry.startsWith('docs/'))
    .map(entry => `/${entry.replace(/\.md$/, '')}`))
}

describe('the crawl list and the navigation agree (K-125 criterion 2)', () => {
  test('every public destination is crawlable', () => {
    expect(['/', ...PUBLIC_NAV.map(entry => entry.to)].filter(path => !isCrawlable(path))).toEqual([])
  })

  test('every console, member and shell destination is not', () => {
    const closed = [
      CONSOLE_HOME.to,
      ...CONSOLE_NAV.map(group => group.prefix),
      ...CONSOLE_NAV.flatMap(group => group.items.map(item => item.to)),
      ...MEMBER_NAV.map(entry => entry.to),
      ...SHELL_NAV.map(entry => entry.to),
    ]
    expect(closed.filter(path => isCrawlable(path))).toEqual([])
  })

  test('the auth and utility pages are not (criterion 6)', () => {
    const pages = ['/sign-in', '/register', '/reset', '/verify', '/magic', '/qr', '/board']
    expect(pages.filter(path => isCrawlable(path))).toEqual([])
  })

  // A guarded page is one a visitor cannot open, whether or not any navigation names it.
  test('no page declaring middleware is crawlable', async () => {
    const leaked: string[] = []
    for (const file of pageFiles()) {
      const source = await Bun.file(join(PAGES, file)).text()
      if (/definePageMeta\(\{[\s\S]*?\bmiddleware\b/.test(source) && isCrawlable(routeOf(file))) leaked.push(file)
    }
    expect(leaked).toEqual([])
  })

  test('the public catalogue survives the training disallow', () => {
    expect(isCrawlable('/training/modules')).toBe(true)
    expect(isCrawlable('/training/modules/abc')).toBe(true)
    expect(isCrawlable('/training')).toBe(false)
    expect(isCrawlable('/training/sessions/abc/register')).toBe(false)
  })

  test('a show page and an editorial page are crawlable; an API route and a booking form are not', () => {
    expect(isCrawlable('/shows/the-seagull')).toBe(true)
    expect(isCrawlable('/about')).toBe(true)
    expect(isCrawlable('/api/health')).toBe(false)
    expect(isCrawlable('/book/abc')).toBe(false)
  })

  test('the disallow list names nothing twice and nothing without a leading slash', () => {
    expect(new Set(ROBOTS_DISALLOW).size).toBe(ROBOTS_DISALLOW.length)
    expect(ROBOTS_DISALLOW.filter(pattern => !pattern.startsWith('/'))).toEqual([])
  })
})

describe('every crawlable page carries a description (K-125 criterion 1)', () => {
  // The catch-all takes its description from the markdown page it renders.
  const FROM_CONTENT = new Set(['[...slug].vue'])

  test('each crawlable page file describes itself through useSeoMeta', async () => {
    const missing: string[] = []
    for (const file of pageFiles()) {
      if (FROM_CONTENT.has(file) || !isCrawlable(routeOf(file))) continue
      const source = await Bun.file(join(PAGES, file)).text()
      if (!/useSeoMeta\(\{[\s\S]*?\bdescription\b/.test(source)) missing.push(file)
    }
    expect(missing).toEqual([])
  })

  test('each public content page describes itself in its frontmatter', async () => {
    const missing: string[] = []
    for (const path of contentRoutes()) {
      const source = await Bun.file(`content${path}.md`).text()
      if (!/^description:\s*\S/m.test(source)) missing.push(path)
    }
    expect(missing).toEqual([])
  })
})

describe('indexability follows the origin a request reached (K-125 criterion 1)', () => {
  test('only the production address indexes', () => {
    expect(siteIndexable(PRODUCTION_SITE_URL)).toBe(true)
    expect(siteIndexable(`${PRODUCTION_SITE_URL}/`)).toBe(true)
    expect(siteIndexable('https://proscenium.newtheatre.org.uk')).toBe(false)
    expect(siteIndexable('http://localhost:3001')).toBe(false)
    expect(siteIndexable(undefined)).toBe(false)
  })

  test('a development server indexes whatever its address', () => {
    expect(siteIndexable('http://localhost:3001', true)).toBe(true)
  })

  // The plugin is wired by hand here: a dev server always indexes, so no end-to-end run ever
  // reaches the branch that keeps a duplicate host out of search.
  test('the server plugin pushes the decision below every configured source', async () => {
    let registered: ((ctx: { event: unknown, siteConfig: unknown }) => void) | undefined
    const pushed: Record<string, unknown>[] = []
    Object.assign(globalThis, { defineNitroPlugin: (setup: unknown) => setup })
    // Loaded by a built path so the tests project does not type the file against Nitro's globals.
    const plugin = await import(['..', '..', 'server', 'plugins', 'site-indexable'].join('/')) as {
      default: (app: unknown) => void
      INDEXABLE_PRIORITY: number
    }
    plugin.default({ hooks: { hook: (_name: string, fn: typeof registered) => void (registered = fn) } })
    expect(registered).toBeDefined()

    const run = (origin: string): Record<string, unknown> => {
      pushed.length = 0
      registered!({ event: { context: { siteConfigNitroOrigin: origin } }, siteConfig: { push: (entry: Record<string, unknown>) => pushed.push(entry) } })
      return pushed[0]!
    }
    expect(run('https://proscenium.newtheatre.org.uk')).toMatchObject({ indexable: false, _priority: plugin.INDEXABLE_PRIORITY })
    expect(run(PRODUCTION_SITE_URL)).toMatchObject({ indexable: true })
    expect(plugin.INDEXABLE_PRIORITY).toBeLessThan(0)
  })
})

describe('the Open Graph image (K-125 criterion 3)', () => {
  test('a poster key under posters/ becomes the address it is served at', () => {
    expect(posterUrl('posters/the-seagull.jpg')).toBe('/posters/the-seagull.jpg')
    expect(posterUrl('/posters/2026/the-seagull.jpg')).toBe('/posters/2026/the-seagull.jpg')
  })

  test('no key, a bare prefix, a key outside posters/ or one climbing out falls back to the default', () => {
    expect(posterUrl(null)).toBeNull()
    expect(posterUrl('posters/')).toBeNull()
    expect(posterUrl('uploads/anything.jpg')).toBeNull()
    expect(isPosterKey('posters/../secrets.txt')).toBe(false)
    expect(isPosterKey('posters/a/..')).toBe(false)
    expect(DEFAULT_OG_IMAGE).toBe('/og-default.png')
  })

  // The files ship with K-126; this branch carries copies so a merge in the wrong order fails
  // here rather than as a 404 on every shared link.
  test('every picture the app names exists under public/', async () => {
    const missing: string[] = []
    for (const path of [...new Bun.Glob('**/*.{vue,ts}').scanSync({ cwd: 'app', onlyFiles: true })].map(file => join('app', file))) {
      const source = await Bun.file(path).text()
      for (const match of source.matchAll(/\/(?:images\/[\w-]+(?:\/[\w-]+)*\.[a-z0-9]+|og-default\.png)\b/g)) {
        if (!await Bun.file(join('public', match[0])).exists()) missing.push(`${match[0]} (${path})`)
      }
    }
    expect(await Bun.file(join('public', DEFAULT_OG_IMAGE)).exists()).toBe(true)
    expect(missing).toEqual([])
  })
})

describe('the old-site redirect map (K-125 criterion 5)', () => {
  const routes = new Set(pageFiles().map(routeOf))
  const content = contentRoutes()
  const resolves = (target: string): boolean => routes.has(target) || content.has(target)

  test('every internal target is a page or a content route, and never another old address', () => {
    const dangling = Object.entries(OLD_SITE_REDIRECTS)
      .filter(([, to]) => to.startsWith('/'))
      .filter(([, to]) => !resolves(to.replace(/\/\*\*$/, '/x')) || to in OLD_SITE_REDIRECTS)
    expect(dangling).toEqual([])
  })

  test('every external target is https', () => {
    expect(Object.values(OLD_SITE_REDIRECTS).filter(to => !to.startsWith('/') && !to.startsWith('https://'))).toEqual([])
  })

  test('a bare path beside a wildcard row exists only where it lands somewhere else', () => {
    const redundant = Object.keys(OLD_SITE_REDIRECTS)
      .filter(from => from.endsWith('/**'))
      .map(from => from.slice(0, -3))
      .filter(bare => bare in OLD_SITE_REDIRECTS && OLD_SITE_REDIRECTS[bare] === OLD_SITE_REDIRECTS[`${bare}/**`])
    expect(redundant).toEqual([])
  })

  test('the old show family lands on the show, and a receipt on ticket retrieval', () => {
    expect(oldShowRedirect('the-seagull')).toBe('/shows/the-seagull')
    expect(oldShowRedirect('the-seagull', ['book'])).toBe('/shows/the-seagull')
    expect(oldShowRedirect('the-seagull', ['booking', 'abc'])).toBe('/qr')
    expect(oldShowRedirect('a b')).toBe('/shows/a%20b')
  })
})
