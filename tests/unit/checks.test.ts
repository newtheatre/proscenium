// F-10: the conformance checks notice when code and declarations disagree.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicComponentProblems } from '../../scripts/checks/site'
import { parseRoute, RESERVED_PREFIXES } from '../../scripts/checks/routes'

function route(path: string, source: string) {
  const root = mkdtempSync(join(tmpdir(), 'route-'))
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, source)
  return parseRoute(file, root)
}

describe('the route check', () => {
  it('reads a route\'s declaration', () => {
    const info = route('lost-property/items.post.ts', 'export default defineRoute({ ability: \'lost-property.items.record\', rateLimit: \'write\', input: schema }, handler)')
    expect(info).toMatchObject({ module: 'lost-property', method: 'post', path: '/api/lost-property/items', usesDefineRoute: true, ability: 'lost-property.items.record', rateLimit: 'write', input: true })
  })
  it('notices a route with neither ability nor public: true', () => {
    const info = route('lost-property/items.get.ts', 'export default defineRoute({ rateLimit: \'default\' }, handler)')
    expect(info.ability).toBeUndefined()
    expect(info.public).toBe(false)
  })
  it('notices a route not written with defineRoute', () => {
    expect(route('lost-property/items.get.ts', 'export default defineEventHandler(() => 1)').usesDefineRoute).toBe(false)
  })
})

describe('the reserved address list', () => {
  it('holds the platform\'s prefixes', () => {
    expect(RESERVED_PREFIXES).toEqual(expect.arrayContaining(['account', 'console', 'sign-in', 'setup', 'api', 'files', 'whats-on', 'shows', 'book', 'forms', 'mailing']))
  })
})

describe('public component aliases', () => {
  it('refuse a clash, an HTML element and a component outside its module\'s name', () => {
    const problems = publicComponentProblems([
      { module: 'public-site', id: 'whats-on', component: 'PublicSiteWhatsOn', alias: 'whats-on' },
      { module: 'core', id: 'listings', component: 'CoreListings', alias: 'whats-on' },
      { module: 'core', id: 'callout', component: 'CoreCallout', alias: 'section' },
      { module: 'core', id: 'apply', component: 'AccessApplication', alias: 'access-application' },
    ])
    expect(problems).toHaveLength(3)
    expect(problems.join('\n')).toMatch(/already public-site's/)
    expect(problems.join('\n')).toMatch(/<section>/)
    expect(problems.join('\n')).toMatch(/start with its module's name, Core/)
  })
  it('accept distinct aliases', () => {
    expect(publicComponentProblems([
      { module: 'core', id: 'access-application', component: 'CoreAccessApplication', alias: 'access-application' },
      { module: 'core', id: 'setting' },
    ])).toEqual([])
  })
})
