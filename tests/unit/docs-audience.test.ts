import { describe, expect, test } from 'bun:test'
import { DOCS_AUDIENCES, committeePaths, readsCommitteeDocs, visibleTree } from '#shared/utils/docs-audience'
import { DOCS_ROOT } from '#shared/utils/docs-paths'

// J-109 criteria 7 and 8, 0093: every page names its audience, and the tree shows committee pages
// to a viewer holding a role or a standing permission. Navigation, never a guard.

async function pages(): Promise<{ file: string, source: string }[]> {
  const found: { file: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    const file = `${DOCS_ROOT}/${entry}`.replace(/\\/g, '/')
    found.push({ file, source: await Bun.file(file).text() })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

const audienceOf = (source: string): string | undefined =>
  source.match(/^---\n([\s\S]*?)\n---/)?.[1]?.match(/^audience:\s*(\S+)\s*$/m)?.[1]

describe('every operator page names its audience (criterion 7)', () => {
  test('as member or committee, and nothing else', async () => {
    const all = await pages()
    expect(all.length).toBeGreaterThan(40)
    const wrong = all.filter(page => !DOCS_AUDIENCES.includes(audienceOf(page.source) as never)).map(page => page.file)
    expect(wrong).toEqual([])
  })

  test('the pages a member or a shift needs are member pages', async () => {
    const all = await pages()
    const committee = all.filter(page => audienceOf(page.source) === 'committee').map(page => page.file)
    expect(committee.filter(file => /\/(02\.my-nnt|03\.tonight)\//.test(file) || file === `${DOCS_ROOT}/index.md`)).toEqual([])
  })

  test('the console sections are committee pages', async () => {
    const all = await pages()
    const member = all.filter(page => audienceOf(page.source) === 'member').map(page => page.file)
    expect(member.filter(file => /\/(04\.box-office|05\.bar|09\.people|10\.money)\//.test(file))).toEqual([])
  })
})

describe('who counts as committee in the tree (criterion 8)', () => {
  test('a live role grant does, even one carrying no permission', () => {
    expect(readsCommitteeDocs({ permissions: [], holdsRole: true })).toBe(true)
  })

  test('a standing permission does', () => {
    expect(readsCommitteeDocs({ permissions: ['night.door'], holdsRole: false })).toBe(true)
  })

  test('a signed-in member with neither does not, whatever shift they hold tonight', () => {
    expect(readsCommitteeDocs({ permissions: [], holdsRole: false })).toBe(false)
  })
})

describe('the tree a viewer sees (criterion 8)', () => {
  const tree = [
    { title: 'Documentation', path: '/docs', audience: 'member' },
    { title: 'My NNT', path: '/docs/my-nnt', children: [
      { title: 'Overview', path: '/docs/my-nnt', audience: 'member' },
      { title: 'Booking tickets', path: '/docs/my-nnt/booking-tickets', audience: 'member' },
    ] },
    { title: 'Money', path: '/docs/money', children: [
      { title: 'Overview', path: '/docs/money', audience: 'committee' },
      { title: 'Exports', path: '/docs/money/exports', audience: 'committee' },
    ] },
    { title: 'System', path: '/docs/system', children: [
      { title: 'Overview', path: '/docs/system', audience: 'committee' },
      { title: 'Reporting a problem', path: '/docs/system/reporting', audience: 'member' },
    ] },
  ]

  test('a member sees member pages, and a section left empty goes with its pages', () => {
    const seen = visibleTree(tree, false)
    expect(seen.map(item => item.title)).toEqual(['Documentation', 'My NNT', 'System'])
    expect(seen[2]!.children!.map(item => item.title)).toEqual(['Reporting a problem'])
  })

  test('the committee sees everything', () => {
    expect(visibleTree(tree, true)).toEqual(tree)
  })

  test('the committee paths are what search leaves out for a member', () => {
    expect([...committeePaths(tree)].sort()).toEqual(['/docs/money', '/docs/money/exports', '/docs/system'])
  })
})

describe('the chrome is told, and the layout filters by it', () => {
  test('the session answer says whether the viewer holds any live role', async () => {
    expect(await Bun.file('server/api/auth/session.get.ts').text()).toMatch(/holdsRole:\s*grants\.length > 0/)
  })

  test('the docs layout filters its tree and its search', async () => {
    const layout = await Bun.file('app/layouts/docs.vue').text()
    expect(layout).toContain('visibleTree(')
    expect(layout).toContain('committeePaths(')
    expect(layout).toContain('readsCommitteeDocs(')
  })
})
