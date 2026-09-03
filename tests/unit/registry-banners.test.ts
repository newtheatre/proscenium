import { describe, expect, test } from 'bun:test'
import { AUDIT_ACTIONS, AUDIT_ACTION_NAMES } from '#shared/utils/audit-actions'
import type { AuditModule } from '#shared/utils/audit-actions'
import { LINE_KINDS } from '#shared/utils/ledger'

// Every stream appends to the same shared registries. A one-line banner per module keeps their
// additions in separate hunks, so two branches adding at once merge instead of conflicting.

const REGISTRIES = [
  'shared/utils/ledger.ts',
  'shared/utils/notifications.ts',
  'shared/utils/audit-actions.ts',
  'shared/utils/audit-coverage.ts',
  'shared/utils/config.ts',
  'shared/utils/personal-data.ts',
  'shared/utils/site-nav.ts',
  'shared/utils/personas.ts',
]

const MODULES: Record<string, string> = {
  A: 'identity',
  C: 'spaces',
  D: 'ticketing',
  E: 'show night',
  F: 'bar',
  G: 'training',
  H: 'communications',
  I: 'finance',
  J: 'governance',
  K: 'platform',
}

// The audit module an action sits under is spelt as a query-string segment; the banner is prose.
const AUDIT_MODULE_OF: Record<string, AuditModule> = {
  'identity': 'identity',
  'spaces': 'spaces',
  'ticketing': 'ticketing',
  'show night': 'show-night',
  'bar': 'bar',
  'training': 'training',
  'communications': 'communications',
  'finance': 'finance',
  'governance': 'governance',
}

const BANNER = /^\s*\/\/ Module ([A-K]): ([a-z ]+)$/

interface Banner { line: number, letter: string, name: string }

function bannersIn(source: string): Banner[] {
  return source.split('\n').flatMap((text, index) => {
    const match = BANNER.exec(text)
    return match ? [{ line: index + 1, letter: match[1]!, name: match[2]! }] : []
  })
}

// What each line sits under: the nearest banner above it, or none.
function sectionOf(lines: string[], index: number): Banner | null {
  for (let i = index; i >= 0; i--) {
    const match = BANNER.exec(lines[i]!)
    if (match) return { line: i + 1, letter: match[1]!, name: match[2]! }
  }
  return null
}

describe('every shared registry carries a banner per module', () => {
  for (const file of REGISTRIES) {
    test(`${file} has banners, and each names a module by its letter`, async () => {
      const banners = bannersIn(await Bun.file(file).text())
      expect(banners.length).toBeGreaterThan(1)
      for (const banner of banners) {
        expect(`${file}:${banner.line} ${banner.letter} ${banner.name}`).toBe(`${file}:${banner.line} ${banner.letter} ${MODULES[banner.letter]}`)
      }
    })
  }

  // A banner directly above another comment reads as one block, and a block over two lines fails
  // check:comments. The blank line between them is what keeps the banner its own block.
  test('a banner is followed by code or a blank line, never by another comment', async () => {
    for (const file of REGISTRIES) {
      const lines = (await Bun.file(file).text()).split('\n')
      lines.forEach((text, index) => {
        if (!BANNER.test(text)) return
        const next = lines[index + 1]?.trim() ?? ''
        expect(`${file}:${index + 2} ${next.startsWith('//')}`).toBe(`${file}:${index + 2} false`)
      })
    }
  })
})

describe('entries sit under the banner of their own module', () => {
  test('every audit action is declared under the module it names', async () => {
    const lines = (await Bun.file('shared/utils/audit-actions.ts').text()).split('\n')
    for (const name of AUDIT_ACTION_NAMES) {
      const index = lines.findIndex(text => text.trimStart().startsWith(`'${name}':`))
      expect(`${name}: ${index >= 0}`).toBe(`${name}: true`)
      const banner = sectionOf(lines, index)
      expect(`${name}: ${banner ? AUDIT_MODULE_OF[banner.name] : 'no banner'}`).toBe(`${name}: ${AUDIT_ACTIONS[name].module}`)
    }
  })

  // A route whose path names its module is the case that goes wrong: `admin/training/external-*`
  // reads as a rooms route to anything matching on `external`.
  test('a coverage row for a route under a module directory sits in that module', async () => {
    const owners: Record<string, string> = { training: 'training', rooms: 'spaces', dev: 'platform' }
    const lines = (await Bun.file('shared/utils/audit-coverage.ts').text()).split('\n')
    lines.forEach((text, index) => {
      const route = /route: '([^']+)'/.exec(text)?.[1]
      if (!route) return
      const owner = owners[route.replace('server/api/admin/', 'server/api/').split('/')[2] ?? '']
      if (!owner) return
      expect(`${route}: ${sectionOf(lines, index)?.name ?? 'no banner'}`).toBe(`${route}: ${owner}`)
    })
  })

  test('every ledger line kind is declared under the module that posts it', async () => {
    const posts: Record<string, string> = {
      TICKET_COLLECTION: 'ticketing',
      WALK_UP: 'ticketing',
      PASS_SALE: 'ticketing',
      PASS_ADMISSION: 'ticketing',
      BAR_ITEM: 'bar',
      TAB_SETTLEMENT: 'bar',
      REFUND: 'finance',
      IMPORT: 'finance',
    }
    const lines = (await Bun.file('shared/utils/ledger.ts').text()).split('\n')
    for (const kind of LINE_KINDS) {
      const index = lines.findIndex(text => text.includes(`name: '${kind.name}'`))
      expect(`${kind.name}: ${index >= 0}`).toBe(`${kind.name}: true`)
      const banner = sectionOf(lines, index)
      expect(`${kind.name}: ${banner?.name ?? 'no banner'}`).toBe(`${kind.name}: ${posts[kind.name]}`)
    }
  })
})
