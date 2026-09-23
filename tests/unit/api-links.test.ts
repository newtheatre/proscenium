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

function apiLinks(file: string, source: string): ApiLink[] {
  const found: ApiLink[] = []
  for (const match of source.matchAll(/:to="([^"]+)"/g)) {
    const expression = match[1] ?? ''
    const identifier = /^[A-Za-z_$][\w$]*/.exec(expression.replace(/^.*\?\s*undefined\s*:\s*/, ''))?.[0]
    const toApi = expression.includes('/api/') || (identifier !== undefined && definesApiUrl(source, identifier))
    if (!toApi) continue
    const start = source.lastIndexOf('<', match.index)
    const close = source.slice(match.index).search(/\n\s*\/?>/)
    const tag = source.slice(start, close === -1 ? undefined : match.index + close)
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
  })

  test('every link whose target is an /api/ route is marked external', () => {
    const routed = links.filter(link => !isExternal(link.tag)).map(link => `${link.file}:${link.line}`)
    expect(routed).toEqual([])
  })

  test('the SU export button is an external link (I-108)', () => {
    const button = links.find(link => link.file === 'pages/money/exports.vue' && link.tag.includes('data-test="export-csv"'))
    expect(button).toBeDefined()
    expect(isExternal(button?.tag ?? '')).toBe(true)
  })

  test('the ticket sales export button is an external link (D-129)', () => {
    const button = links.find(link => link.file === 'pages/box-office/shows/index.vue' && link.tag.includes('data-test="ticket-export-csv"'))
    expect(button).toBeDefined()
    expect(isExternal(button?.tag ?? '')).toBe(true)
  })
})
