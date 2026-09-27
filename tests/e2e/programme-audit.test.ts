import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// 0049 for the programme's names and addresses: the audit row rides the conditional write in one
// batch, so a write the name or address predicate refuses leaves no row in the trail.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': officer.cookie },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function count(statement: string, ...parameters: string[]): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters) as { n: number }).n
  }
  finally {
    database.close()
  }
}

const rows = (action: string): number => count('SELECT count(*) AS n FROM audit_log WHERE action = ?', action)
const rowsFor = (action: string, target: string): number =>
  count('SELECT count(*) AS n FROM audit_log WHERE action = ? AND target = ?', action, target)

const tag = (): string => crypto.randomUUID().slice(0, 8)

async function created(path: string, body: unknown): Promise<string> {
  const answered = await send('POST', path, body)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

// A second create under a name already held, then a rename onto it: both 409, neither audited.
async function refusedTwice(
  family: string,
  path: string,
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  rename: Record<string, unknown>,
): Promise<string> {
  await created(path, first)
  const other = await created(path, second)

  const before = rows(`${family}.created`)
  expect((await send('POST', path, first)).status).toBe(409)
  expect(rows(`${family}.created`)).toBe(before)

  expect((await send('PUT', `${path}/${other}`, rename)).status).toBe(409)
  expect(rowsFor(`${family}.updated`, `${family}:${other}`)).toBe(0)
  return other
}

describe.skipIf(skip !== null)('a refused name or address write leaves no audit row (0049)', () => {
  test('content warnings', async () => {
    const one = { slug: `strobe-${tag()}`, title: `Strobe ${tag()}`, kind: 'TECHNICAL' }
    const two = { slug: `smoke-${tag()}`, title: `Smoke ${tag()}`, kind: 'TECHNICAL' }
    await refusedTwice('content-warning', '/api/admin/content-warnings', one, two, { ...two, title: one.title })
  }, CASE_TIMEOUT_MS)

  test('seasons', async () => {
    const one = { name: `Autumn ${tag()}`, startsOn: '2026-09-01', endsOn: '2026-12-20' }
    const two = { name: `Spring ${tag()}`, startsOn: '2027-01-10', endsOn: '2027-04-01' }
    await refusedTwice('season', '/api/admin/reference-data/seasons', one, two, { ...two, name: one.name.toUpperCase() })
  }, CASE_TIMEOUT_MS)

  test('show categories', async () => {
    const one = { name: `Musical ${tag()}` }
    const two = { name: `Drama ${tag()}` }
    await refusedTwice('show-category', '/api/admin/reference-data/show-categories', one, two, { ...two, name: one.name })
  }, CASE_TIMEOUT_MS)

  test('venues', async () => {
    const one = { name: `Studio ${tag()}`, capacity: 40 }
    const two = { name: `Hall ${tag()}`, capacity: 80 }
    await refusedTwice('venue', '/api/admin/reference-data/venues', one, two, { ...two, name: one.name })
  }, CASE_TIMEOUT_MS)

  test('ticket types, whose price change is audited apart and is refused with the rename', async () => {
    const one = { name: `Standard ${tag()}`, price: 900 }
    const two = { name: `Concession ${tag()}`, price: 500 }
    const other = await refusedTwice('ticket-type', '/api/admin/ticket-types', one, two, { ...two, name: one.name, price: 600 })
    expect(rowsFor('ticket-type.price.changed', `ticket-type:${other}`)).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('pass types, whose price points move only with the write', async () => {
    const window = { validFrom: 1_900_000_000, validUntil: 1_910_000_000 }
    const one = { name: `Season ${tag()}`, slug: `season-${tag()}`, ...window, prices: [{ label: 'Standard', price: 4500 }], showIds: [] }
    const two = { name: `Flexi ${tag()}`, slug: `flexi-${tag()}`, ...window, prices: [{ label: 'Standard', price: 3000 }], showIds: [] }
    const { showIds: _shows, ...rest } = two
    const other = await refusedTwice('pass-type', '/api/admin/pass-types', one, two, {
      ...rest, slug: one.slug, status: 'DRAFT', prices: [{ label: 'Changed', price: 1 }],
    })
    expect(count('SELECT count(*) AS n FROM pass_type_prices WHERE pass_type_id = ? AND label = ?', other, 'Standard')).toBe(1)
    expect(count('SELECT count(*) AS n FROM pass_type_prices WHERE pass_type_id = ? AND label = ?', other, 'Changed')).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('shows, which are only created here', async () => {
    const slug = `the-seagull-${tag()}`
    await created('/api/admin/shows', { title: 'The Seagull', slug })
    const before = rows('show.created')
    expect((await send('POST', '/api/admin/shows', { title: 'Another Seagull', slug })).status).toBe(409)
    expect(rows('show.created')).toBe(before)
  }, CASE_TIMEOUT_MS)
})
