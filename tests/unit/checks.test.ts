// F-10: the conformance checks notice when code and declarations disagree.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicComponentProblems } from '../../scripts/checks/site'
import { parseRoute, RESERVED_PREFIXES } from '../../scripts/checks/routes'
import { checkAccountComparisons } from '../../scripts/checks/source'
import { ROOT } from '../../scripts/lib/paths'

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
    expect(RESERVED_PREFIXES).toEqual(expect.arrayContaining(['account', 'console', 'admin', 'sign-in', 'setup', 'api', 'files', 'whats-on', 'shows', 'book', 'forms', 'mailing']))
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

describe('the account scope check', () => {
  const registry = { tables: new Map<string, any>([
    ['lost_property_claims', { meta: { columns: { accountId: { sql: 'account_id', meta: { account: { role: 'subject', onMerge: 'alias' } } } } } }],
    ['lost_property_ledger', { meta: { columns: { accountId: { sql: 'account_id', meta: { class: 'internal' } } } } }],
  ]) }
  const problems = (source: string) => {
    const root = mkdtempSync(join(tmpdir(), 'account-'))
    mkdirSync(join(root, 'server'), { recursive: true })
    writeFileSync(join(root, 'server', 'claims.ts'), source)
    return checkAccountComparisons([{ found: { root: relative(ROOT, root) } } as any], registry)
  }

  it('refuses comparing an account column to an id, in SQL or with Drizzle', () => {
    expect(problems("await all('SELECT * FROM lost_property_claims WHERE account_id = ?', id)")).toHaveLength(1)
    expect(problems("await all('SELECT * FROM lost_property_claims WHERE account_id IN (SELECT value FROM json_each(?))', ids)")).toHaveLength(1)
    expect(problems('await useDb().select().from(claims).where(eq(claims.accountId, id))')).toHaveLength(0) // accountId is also a ledger column, so Drizzle names are judged only when unambiguous
  })
  it('accepts the scope, a column of the same name that is not an account, and a reasoned exact match', () => {
    expect(problems('await useDb().select().from(claims).where(inAccountScope(claims.accountId, id))')).toEqual([])
    expect(problems("await all('SELECT * FROM lost_property_ledger WHERE account_id = ?', id)")).toEqual([])
    expect(problems('where(exactAccount(claims.accountId, id))')).toHaveLength(1)
    expect(problems('where(exactAccount(claims.accountId, id)) // exact-account: the claim is keyed by the person who made it')).toEqual([])
  })
  it('passes an assignment in an UPDATE and a stand-in declaring exactAccount', () => {
    expect(problems("sql: 'UPDATE lost_property_claims SET account_id = ?, updated_at = ? WHERE id = ?'")).toEqual([])
    expect(problems("sql: 'UPDATE lost_property_claims SET note = ? WHERE account_id = ?'")).toHaveLength(1)
    expect(problems('export function exactAccount(column: string, accountId: string) {')).toEqual([])
  })
})
