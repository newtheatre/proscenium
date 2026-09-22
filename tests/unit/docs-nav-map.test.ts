import { describe, expect, test } from 'bun:test'
import { DOCS_ROOT } from '#shared/utils/docs-paths'
import { CONSOLE_NAV, NAV_SECTIONS, SHELL_NAV } from '#shared/utils/site-nav'

// The tree, the titles and the addresses say what the screens say (J-109, 0076, issue 1154 items
// 1, 2, 6 and 8). The sidebar map on Finding your way is hand-written: this stops it drifting.

const MAP_PAGE = `${DOCS_ROOT}/01.getting-started/4.finding-your-way.md`
const MAP_OPENER = 'The groups and their screens, in sidebar order:'

interface Page { file: string, section: string, slug: string, title: string, isIndex: boolean }

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function titleOf(file: string): Promise<string> {
  const front = (await Bun.file(file).text()).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  return front.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

async function pages(): Promise<Page[]> {
  const found: Page[] = []
  for (const entry of new Bun.Glob('*/*.md').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    const [folder, name] = entry.replace(/\\/g, '/').split('/') as [string, string]
    found.push({
      file: `${DOCS_ROOT}/${entry}`,
      section: folder.replace(/^\d+\./, ''),
      slug: name.replace(/^\d+\./, '').replace(/\.md$/, ''),
      title: await titleOf(`${DOCS_ROOT}/${entry}`),
      isIndex: name === 'index.md',
    })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

async function sectionTitles(): Promise<{ folder: string, title: string }[]> {
  const found: { folder: string, title: string }[] = []
  for (const entry of new Bun.Glob('*/.navigation.yml').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    const folder = entry.replace(/\\/g, '/').split('/')[0]!
    const title = (await Bun.file(`${DOCS_ROOT}/${entry}`).text()).match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? ''
    found.push({ folder, title })
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder))
}

// One line per group, in the shape the page writes them: "Bar. Every day: … Set-up: …", or
// "People: …" where the group is not split. Trailing full stops are the prose's, not the data's.
function navLines(): string[] {
  return CONSOLE_NAV.map((group) => {
    const split = group.items.some(item => item.section)
    if (!split) return `${group.label}: ${group.items.map(item => item.label).join(', ')}`
    const parts = NAV_SECTIONS.map(section =>
      `${section}: ${group.items.filter(item => item.section === section).map(item => item.label).join(', ')}`)
    return `${group.label}. ${parts.join('. ')}`
  })
}

function mapLines(source: string): string[] {
  const start = source.indexOf(MAP_OPENER)
  if (start === -1) return []
  const rest = source.slice(start + MAP_OPENER.length).replace(/^\s*\n/, '')
  const block = rest.split(/\n\s*\n/)[0] ?? ''
  return block
    .split(/\n(?=- )/)
    .map(line => line.replace(/\s+/g, ' ').replace(/^- /, '').replace(/\*\*/g, '').replace(/\.$/, '').trim())
    .filter(line => line.length > 0)
}

describe('the wiki names what the screens name (issue 1154 items 1, 2, 6 and 8)', () => {
  test('the sidebar map on Finding your way is the console navigation', async () => {
    expect(mapLines(await Bun.file(MAP_PAGE).text())).toEqual(navLines())
  })

  test('the page names the two sections the sidebar splits on', async () => {
    const source = await Bun.file(MAP_PAGE).text()
    for (const section of NAV_SECTIONS) expect(source).toContain(`**${section}**`)
  })

  test('every section of the tree is titled as the shells and groups are', async () => {
    const shells = SHELL_NAV.filter(entry => entry.to === '/my' || entry.to === '/tonight').map(entry => entry.label)
    const wanted = ['Getting started', ...shells, ...CONSOLE_NAV.map(group => group.label)].sort()
    expect((await sectionTitles()).map(one => one.title).sort()).toEqual(wanted)
  })

  test('a section overview carries its section title', async () => {
    const titles = new Map((await sectionTitles()).map(one => [one.folder, one.title]))
    const wrong = (await pages())
      .filter(page => page.isIndex)
      .filter(page => page.title !== titles.get(`${page.file.split('/')[2]}`))
      .map(page => `${page.file}  ${page.title}`)
    expect(wrong).toEqual([])
  })

  test('no two pages share a title', async () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const page of (await pages()).filter(one => !one.isIndex)) {
      const held = seen.get(page.title)
      if (held) clashes.push(`${page.file}  ${page.title}, the same title as ${held}`)
      seen.set(page.title, page.file)
    }
    expect(clashes).toEqual([])
  })

  test('a page address is its title', async () => {
    const wrong = (await pages())
      .filter(page => !page.isIndex)
      .filter(page => page.slug !== slugify(page.title))
      .map(page => `${page.file}  is titled ${page.title}, which reads as ${slugify(page.title)}`)
    expect(wrong).toEqual([])
  })
})
