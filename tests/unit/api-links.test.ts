import { describe, expect, test } from 'bun:test'

// A link to a server route must leave the client router: without `external`, Vue Router resolves
// `/api/...` itself and lands on the 404 page instead of the download (#1214).

const APP = 'app'

const files = [...new Bun.Glob('**/*.vue').scanSync({ cwd: APP })]

interface ApiLink { file: string, line: number, tag: string }

function definesApiUrl(source: string, name: string): boolean {
  const definition = new RegExp(`(?:const|function)\\s+${name}\\b`).exec(source)
  if (!definition) return false
  const end = source.indexOf('\n\n', definition.index)
  return source.slice(definition.index, end === -1 ? undefined : end).includes('/api/')
}

function tagEnd(source: string, from: number): number {
  let quote: string | null = null
  for (let at = from; at < source.length; at++) {
    const character = source[at]
    if (quote) {
      if (character === quote) quote = null
    }
    else if (character === '"' || character === '\'') quote = character
    else if (character === '>') return at
  }
  return source.length
}

function apiLinks(file: string, source: string): ApiLink[] {
  const found: ApiLink[] = []
  for (const match of source.matchAll(/(:to|\bto|:href)="([^"]+)"/g)) {
    const bound = match[1]?.startsWith(':') ?? false
    const expression = match[2] ?? ''
    const identifier = bound ? /^[A-Za-z_$][\w$]*/.exec(expression.replace(/^.*\?\s*undefined\s*:\s*/, ''))?.[0] : undefined
    const toApi = expression.includes('/api/') || (identifier !== undefined && definesApiUrl(source, identifier))
    if (!toApi) continue
    const start = source.lastIndexOf('<', match.index)
    const tag = source.slice(start, tagEnd(source, match.index) + 1)
    found.push({ file, line: source.slice(0, match.index).split('\n').length, tag })
  }
  return found
}

const links = await Promise.all(files.map(async file => apiLinks(file, await Bun.file(`${APP}/${file}`).text())))
  .then(each => each.flat())

const isExternal = (tag: string): boolean => /\sexternal(?=[\s=>]|$)/.test(tag)

describe('a link to a server route downloads rather than routing (I-108, D-129, #1214)', () => {
  test('the scan finds the export links, so a broken pattern cannot pass by finding none', () => {
    const where = links.map(link => link.file)
    expect(where).toContain('pages/money/exports.vue')
    expect(where).toContain('pages/box-office/shows/index.vue')
    expect(where).toContain('pages/bar/reports.vue')
    expect(where).toContain('pages/bar/stock/order-list.vue')
    expect(where).toContain('pages/account/security.vue')
    expect(where).toContain('pages/reports/index.vue')
  })

  test('every link whose target is an /api/ route is marked external', () => {
    const routed = links.filter(link => !isExternal(link.tag)).map(link => `${link.file}:${link.line}`)
    expect(routed).toEqual([])
  })

  test.each([
    ['SU export', 'I-108', 'pages/money/exports.vue', 'export-csv'],
    ['ticket sales export', 'D-129', 'pages/box-office/shows/index.vue', 'ticket-export-csv'],
    ['incident trend export', 'E-126', 'pages/reports/index.vue', 'export-incidents'],
    ['performance report export', 'E-126', 'pages/reports/index.vue', 'export-performances'],
  ])('the %s button is an external link (%s)', (_label, _story, file, dataTest) => {
    const button = links.find(link => link.file === file && link.tag.includes(`data-test="${dataTest}"`))
    expect(button).toBeDefined()
    expect(isExternal(button?.tag ?? '')).toBe(true)
  })
})
