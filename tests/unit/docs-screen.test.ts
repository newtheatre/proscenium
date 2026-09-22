import { describe, expect, test } from 'bun:test'
import { DOCS_ROOT } from '#shared/utils/docs-paths'

// The wiki is read on a phone, on a shift, by somebody a refusal has just stopped (J-109,
// issue 1154 items 7 and 9). What that reader needs first is held here.

const LAYOUT = 'app/layouts/docs.vue'
const PAGE = 'app/pages/docs/[...slug].vue'
const REFUSALS = '## If something goes wrong'

async function pages(): Promise<{ file: string, source: string }[]> {
  const found: { file: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    const file = `${DOCS_ROOT}/${entry}`.replace(/\\/g, '/')
    found.push({ file, source: await Bun.file(file).text() })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

function sections(source: string): string[] {
  return source.split('\n').filter(line => line.startsWith('## ')).map(line => line.trim())
}

describe('the wiki on a phone (issue 1154 item 7)', () => {
  test('a page says when it was updated in the house date, not an ISO string', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('saysDay(')
    expect(source).not.toContain('{{ page!.updatedOn }}')
  })

  test('the tree is reachable below lg, from the header rather than the aside', async () => {
    const source = await Bun.file(LAYOUT).text()
    const body = source.slice(source.indexOf('<template #body>'), source.indexOf('</UHeader>'))
    expect(body).toContain('UContentNavigation')
    // The aside itself only appears from lg, which is why the header carries the same tree.
    expect(source).toContain('UPageAside')
  })

  test('the table of contents stays shut until a phone asks for it', async () => {
    const source = await Bun.file(PAGE).text()
    const opened = source.indexOf('<UContentToc')
    expect(opened).toBeGreaterThan(-1)
    // Its own disclosure shows below lg and starts closed, so nothing is passed to open it.
    const toc = source.slice(opened, source.indexOf('/>', opened))
    expect(toc).not.toContain('default-open')
    expect(toc).not.toContain(':open')
  })
})

describe('a refusal is the first thing a page offers (issue 1154 item 9)', () => {
  test('every page carrying refusals puts them first', async () => {
    const wrong = (await pages())
      .filter(page => page.source.includes(REFUSALS))
      .filter(page => sections(page.source)[0] !== REFUSALS)
      .map(page => `${page.file}  opens with ${sections(page.source)[0]}`)
    expect(wrong).toEqual([])
  })

  test('the pages that carry them are most of the wiki', async () => {
    const carrying = (await pages()).filter(page => page.source.includes(REFUSALS))
    expect(carrying.length).toBeGreaterThan(70)
  })

  test('the index says a page is read that way', async () => {
    const index = await Bun.file(`${DOCS_ROOT}/index.md`).text()
    const shape = index.slice(index.indexOf('## How to read a page'))
    expect(shape.indexOf('If something goes wrong')).toBeLessThan(shape.indexOf('Numbered steps'))
  })
})
