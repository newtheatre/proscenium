import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { DOCS_ROOT, contentPathOf } from '#shared/utils/docs-paths'
import { CONSOLE_HOME, CONSOLE_NAV, MY_NAV } from '#shared/utils/site-nav'

// Every screen names its documentation page and every page it names exists (J-109 criterion 1,
// 0076). A renamed page or a screen added without one fails here rather than in a foyer.

const PAGES = 'app/pages'

async function pages(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES, onlyFiles: true })) {
    const path = join(PAGES, entry).replace(/\\/g, '/')
    found.push({ path, source: await Bun.file(path).text() })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

function docsRoutes(): Set<string> {
  const found = new Set<string>()
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    found.add(contentPathOf(`docs/${entry}`))
  }
  return found
}

function docsMeta(source: string): string | null {
  return source.match(/definePageMeta\(\{[\s\S]*?docs:\s*'([^']+)'/)?.[1] ?? null
}

function fileFor(route: string, all: { path: string, source: string }[]): { path: string, source: string } | undefined {
  const flat = `${PAGES}${route}.vue`
  const index = `${PAGES}${route === '/' ? '' : route}/index.vue`
  return all.find(page => page.path === flat || page.path === index)
}

describe('every screen is one tap from its documentation (J-109 criterion 1)', () => {
  test('every docs meta names a page that exists', async () => {
    const routes = docsRoutes()
    const named = (await pages()).map(page => docsMeta(page.source)).filter((docs): docs is string => docs !== null)
    // A floor, so an empty glob or a broken regex cannot pass as "nothing to check".
    expect(named.length).toBeGreaterThan(40)
    expect(named.filter(docs => !routes.has(docs))).toEqual([])
  })

  test('every console and member destination carries one', async () => {
    const all = await pages()
    const destinations = [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items), ...MY_NAV].map(entry => entry.to)
    const missing = destinations.filter((to) => {
      const page = fileFor(to, all)
      return page === undefined || docsMeta(page.source) === null
    })
    expect(missing).toEqual([])
  })

  test('every show-night screen carries one', async () => {
    const missing = (await pages())
      .filter(page => page.path.startsWith('app/pages/tonight/') && docsMeta(page.source) === null)
      .map(page => page.path)
    expect(missing).toEqual([])
  })
})
