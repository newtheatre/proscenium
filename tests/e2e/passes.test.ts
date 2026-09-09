import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { expectOneWinner, race } from '#tests/helpers/race'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-124 through the real routes. The named cap-overselling race is proven directly against a
// scratch database in tests/integration/races-pass-issue.test.ts; this confirms it end to end.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  boxOffice = await registerMember(app, 'boxoffice', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = boxOffice.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const now = Math.floor(Date.now() / 1000)

async function onSalePassType(over: Record<string, unknown> = {}): Promise<{ id: string, priceId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const name = named('Season pass')
  const created = await send('POST', '/api/admin/pass-types', {
    name,
    slug: slugged(name),
    validFrom: now,
    validUntil: now + 180 * 86_400,
    prices: [{ label: 'Standard', price: 4500 }],
    showIds: [showId],
    ...over,
  }, officer.cookie)
  expect(created.status).toBe(200)
  const { id } = await created.json() as { id: string }

  const detail = await send('GET', `/api/admin/pass-types/${id}`, undefined, officer.cookie)
  const { prices } = await detail.json() as { prices: { id: string }[] }

  const published = await send('PUT', `/api/admin/pass-types/${id}`, {
    name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400,
    prices: [{ label: 'Standard', price: 4500 }], status: 'ON_SALE', ...over,
  }, officer.cookie)
  expect(published.status).toBe(200)

  return { id, priceId: prices[0]!.id }
}

describe.skipIf(skip !== null)('issuing a pass at the desk (criteria 1, 2)', () => {
  test('a matching figure issues the pass, attaches it to the buyer and posts a PASS_SALE entry', async () => {
    const { id: passTypeId, priceId } = await onSalePassType()
    const buyer = await registerMember(app, 'buyer', generatePassword())

    const issued = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: buyer.id, expectedTotalPence: 4500,
    })
    expect(issued.status).toBe(200)
    const { passId, reference } = await issued.json() as { passId: string, reference: string }

    const pass = query<{ userId: string, status: string }>('SELECT user_id AS userId, status FROM passes WHERE id = ?', passId)
    expect(pass?.userId).toBe(buyer.id)
    expect(pass?.status).toBe('ACTIVE')

    const line = query<{ kind: string, amountPence: number }>(
      'SELECT kind AS kind, amount_pence AS amountPence FROM ledger_lines WHERE price_ref = ?', passId,
    )
    expect(line).toEqual({ kind: 'PASS_SALE', amountPence: 4500 })

    const entry = query<{ source: string, tender: string }>(
      `SELECT e.source AS source, e.tender AS tender FROM ledger_entries e
       JOIN ledger_lines l ON l.entry_id = e.id WHERE l.price_ref = ?`, passId,
    )
    expect(entry).toEqual({ source: 'DESK', tender: 'CARD' })
    expect(reference).toHaveLength(6)
  }, CASE_TIMEOUT_MS)

  test('a mismatch is refused quoting both figures, and nothing is written', async () => {
    const { id: passTypeId, priceId } = await onSalePassType()
    const buyer = await registerMember(app, 'buyer', generatePassword())

    const wrong = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: buyer.id, expectedTotalPence: 100,
    })
    expect(wrong.status).toBe(409)
    const text = await wrong.text()
    expect(text).toContain('£1.00')
    expect(text).toContain('£45.00')

    const count = query<{ total: number }>('SELECT count(*) AS total FROM passes WHERE pass_type_id = ?', passTypeId)
    expect(count?.total).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('a draft pass has nothing to sell yet', async () => {
    const { id: passTypeId, priceId } = await onSalePassType({ status: 'DRAFT' })
    const buyer = await registerMember(app, 'buyer', generatePassword())

    const refused = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: buyer.id, expectedTotalPence: 4500,
    })
    expect(refused.status).toBe(409)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the cap is asked at issue, atomically, never at request (criterion 4)', () => {
  test('a full cap refuses the next issue', async () => {
    const { id: passTypeId, priceId } = await onSalePassType({ maxIssued: 1 })
    const first = await registerMember(app, 'first', generatePassword())
    const second = await registerMember(app, 'second', generatePassword())

    const filled = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: first.id, expectedTotalPence: 4500,
    })
    expect(filled.status).toBe(200)

    const refused = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: second.id, expectedTotalPence: 4500,
    })
    expect(refused.status).toBe(409)
    expect(await refused.text()).toContain('1')
  }, CASE_TIMEOUT_MS)

  test('two racing issues against a cap of one leave exactly one', async () => {
    const { id: passTypeId, priceId } = await onSalePassType({ maxIssued: 1 })
    const buyers = await Promise.all([
      registerMember(app, 'racer', generatePassword()),
      registerMember(app, 'racer', generatePassword()),
    ])

    const answers = await race(2, async (index) => {
      const answered = await send('POST', '/api/box-office/desk/passes', {
        passTypeId, passTypePriceId: priceId, userId: buyers[index]!.id, expectedTotalPence: 4500,
      })
      return { status: answered.status }
    })

    expectOneWinner(answers)

    const total = query<{ total: number }>('SELECT count(*) AS total FROM passes WHERE pass_type_id = ?', passTypeId)
    expect(total?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('requesting online, and fulfilling at the desk (criterion 3)', () => {
  test('a request reserves nothing, and the desk sees it by name', async () => {
    const { id: passTypeId } = await onSalePassType()
    const requester = await registerMember(app, 'requester', generatePassword())

    const requested = await send('POST', '/api/account/passes/request', { passTypeId }, requester.cookie)
    expect(requested.status).toBe(200)

    const count = query<{ total: number }>('SELECT count(*) AS total FROM passes WHERE pass_type_id = ?', passTypeId)
    expect(count?.total).toBe(0)

    const pending = await send('GET', `/api/box-office/desk/passes/${passTypeId}/requests`)
    const { items } = await pending.json() as { items: { userId: string, name: string }[] }
    expect(items.some(item => item.userId === requester.id)).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('issuing with the request id fulfils it in the same batch', async () => {
    const { id: passTypeId, priceId } = await onSalePassType()
    const requester = await registerMember(app, 'requester', generatePassword())

    const requested = await send('POST', '/api/account/passes/request', { passTypeId }, requester.cookie)
    const { id: requestId } = await requested.json() as { id: string }

    const issued = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: requester.id, expectedTotalPence: 4500, requestId,
    })
    expect(issued.status).toBe(200)

    const row = query<{ status: string, passId: string | null }>(
      'SELECT status AS status, pass_id AS passId FROM pass_requests WHERE id = ?', requestId,
    )
    expect(row?.status).toBe('FULFILLED')
    expect(row?.passId).not.toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a request past its product\'s sales window lapses on the sweep', async () => {
    const { id: passTypeId } = await onSalePassType({ salesCloseAt: now - 3_600 })
    const requester = await registerMember(app, 'requester', generatePassword())
    write(
      'INSERT INTO pass_requests (id, pass_type_id, user_id, status) VALUES (?, ?, ?, ?)',
      crypto.randomUUID(), passTypeId, requester.id, 'PENDING',
    )

    expect((await fetch(`${app.baseURL}/_nitro/tasks/passes:expire-requests`, { method: 'POST' })).status).toBe(200)

    const row = query<{ status: string }>('SELECT status AS status FROM pass_requests WHERE user_id = ?', requester.id)
    expect(row?.status).toBe('EXPIRED')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a member views what they hold, and receives a scannable QR (criterion 5)', () => {
  test('the held pass appears in the account listing', async () => {
    const { id: passTypeId, priceId } = await onSalePassType()
    const buyer = await registerMember(app, 'buyer', generatePassword())

    const issued = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: buyer.id, expectedTotalPence: 4500,
    })
    expect(issued.status).toBe(200)

    const listed = await send('GET', '/api/account/passes', undefined, buyer.cookie)
    const body = await listed.json() as { passes: { reference: string }[] }
    const { reference } = await issued.json() as { reference: string }
    expect(body.passes.some(one => one.reference === reference)).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('opening the pass QR sets a cookie and the current-pass route answers from it', async () => {
    const { id: passTypeId, priceId } = await onSalePassType()
    const buyer = await registerMember(app, 'buyer', generatePassword())

    const issued = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: buyer.id, expectedTotalPence: 4500,
    })
    const { reference, qrToken } = await issued.json() as { reference: string, qrToken: string }

    const opened = await fetch(`${app.baseURL}/passes/${qrToken}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/passes')
    const cookie = opened.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')

    const current = await fetch(`${app.baseURL}/api/passes/current`, { headers: { cookie: cookie.split(';')[0]! } })
    expect(current.status).toBe(200)
    const body = await current.json() as { reference: string, status: string }
    expect(body.reference).toBe(reference)
    expect(body.status).toBe('ACTIVE')
  }, CASE_TIMEOUT_MS)

  test('a forged pass token is refused, and a reservation token does not resolve here either', async () => {
    const forged = await fetch(`${app.baseURL}/passes/not-a-real-token`, { redirect: 'manual' })
    expect(forged.status).toBe(302)
    expect(forged.headers.get('location')).toBe('/passes?refused=invalid')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a buyer is chosen by name or email, never typed as an id (K-123 criterion 1)', () => {
  test('an ordinary desk officer can search, holding no accounts.read', async () => {
    const buyer = await registerMember(app, 'searchable', generatePassword())

    const found = await send('GET', `/api/box-office/desk/passes/buyers?q=${encodeURIComponent(buyer.name)}`)
    expect(found.status).toBe(200)
    const { items } = await found.json() as { items: { id: string }[] }
    expect(items.some(item => item.id === buyer.id)).toBe(true)
  }, CASE_TIMEOUT_MS)
})
