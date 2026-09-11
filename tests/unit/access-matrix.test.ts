import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// A-129 criterion 3: every member-facing page is a row in docs/access-matrix.md. "Member-facing"
// is a member layout or the signed-in middleware, the same two facts AuthStatus and the guard read.

const PAGES = 'app/pages'
const MATRIX = 'docs/access-matrix.md'

async function pages(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES, onlyFiles: true })) {
    const path = join(PAGES, entry)
    found.push({ path, source: await Bun.file(path).text() })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

// The route a page file serves, by Nuxt's own conventions (mirrors tests/unit/site-nav.test.ts).
function routeOf(path: string): string {
  const route = path.replace(`${PAGES}/`, '').replace(/\.vue$/, '').replace(/\/index$/, '')
  return `/${route === 'index' ? '' : route}`.replace(/\/$/, '') || '/'
}

async function memberFacingRoutes(): Promise<string[]> {
  return (await pages())
    .filter(page => page.source.includes('layout: \'member\'') || page.source.includes('middleware: \'signed-in\''))
    .map(page => routeOf(page.path))
}

describe('every member-facing page is in the access matrix (A-129 criterion 3)', () => {
  test('a page with the member layout or signed-in middleware has a row', async () => {
    const matrix = await Bun.file(MATRIX).text()
    const missing = (await memberFacingRoutes()).filter(route => !matrix.includes(`\`${route}\``))
    expect(missing).toEqual([])
  })

  test('at least one page is actually found, so an empty glob cannot pass silently', async () => {
    expect((await memberFacingRoutes()).length).toBeGreaterThan(10)
  })
})
