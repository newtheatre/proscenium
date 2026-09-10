import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { OLD_SITE_REDIRECTS, oldShowRedirect } from '#shared/utils/redirects'
import {
  DEFAULT_OG_IMAGE,
  NOINDEX_PAGES,
  PRODUCTION_SITE_URL,
  ROBOTS_DISALLOW,
  SITE_NAME,
  isCrawlable,
  posterUrl,
  robotsMatches,
  siteIndexable,
  titleFor,
} from '#shared/utils/seo'
import { CONSOLE_HOME, CONSOLE_NAV, MEMBER_NAV, PUBLIC_NAV, SHELL_NAV } from '#shared/utils/site-nav'

// K-125: the crawl and sitemap lists are held against the navigation declaration (0040), so a
// screen added to the site cannot be indexed, or hidden, by accident.

const PAGES = 'app/pages'

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

describe('robots patterns (K-125 criterion 2)', () => {
  test('a bare pattern is a prefix', () => {
    expect(robotsMatches('/admin', '/admin')).toBe(true)
    expect(robotsMatches('/admin', '/admin/audit')).toBe(true)
    expect(robotsMatches('/admin', '/administer')).toBe(true)
    expect(robotsMatches('/admin', '/about')).toBe(false)
  })

  test('a dollar ends the path exactly and a star spans anything', () => {
    expect(robotsMatches('/training$', '/training')).toBe(true)
    expect(robotsMatches('/training$', '/training/modules')).toBe(false)
    expect(robotsMatches('/rooms/*/book', '/rooms/abc/book')).toBe(true)
  })
})

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
    expect(NOINDEX_PAGES.filter(path => isCrawlable(path))).toEqual([])
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

describe('indexability follows the site URL (K-125 criterion 1)', () => {
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
})

describe('the title template (K-125 criterion 1)', () => {
  test('a page title takes the house name after it', () => {
    expect(titleFor('What\'s on')).toBe(`What's on | ${SITE_NAME}`)
  })

  test('a title that is already the house name stands alone', () => {
    expect(titleFor('The Nottingham New Theatre')).toBe('The Nottingham New Theatre')
    expect(titleFor(SITE_NAME)).toBe(SITE_NAME)
  })

  test('no title at all is the house name', () => {
    expect(titleFor(undefined)).toBe(SITE_NAME)
    expect(titleFor('  ')).toBe(SITE_NAME)
  })
})

describe('the Open Graph image (K-125 criterion 3)', () => {
  test('a poster key under posters/ becomes the address it is served at', () => {
    expect(posterUrl('posters/the-seagull.jpg')).toBe('/posters/the-seagull.jpg')
    expect(posterUrl('/posters/the-seagull.jpg')).toBe('/posters/the-seagull.jpg')
  })

  test('no key, an empty key, or a key outside posters/ falls back to the default', () => {
    expect(posterUrl(null)).toBeNull()
    expect(posterUrl('posters/')).toBeNull()
    expect(posterUrl('uploads/anything.jpg')).toBeNull()
    expect(DEFAULT_OG_IMAGE).toBe('/og-default.png')
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

  test('no address redirects to itself', () => {
    expect(Object.entries(OLD_SITE_REDIRECTS).filter(([from, to]) => from === to)).toEqual([])
  })

  test('the old show family lands on the show, and a receipt on ticket retrieval', () => {
    expect(oldShowRedirect('the-seagull')).toBe('/shows/the-seagull')
    expect(oldShowRedirect('the-seagull', ['book'])).toBe('/shows/the-seagull')
    expect(oldShowRedirect('the-seagull', ['booking', 'abc'])).toBe('/qr')
    expect(oldShowRedirect('a b')).toBe('/shows/a%20b')
  })
})
