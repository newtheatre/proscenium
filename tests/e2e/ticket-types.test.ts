import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-119 through the real routes and the real screen. What a type has ever been sold under is a
// question about other tables, and the integration suite is where that predicate is pinned.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let member: TestMember
const boxOfficePassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())

  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function trail<T>(action: string, target: string): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT actor_id AS actorId, detail FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { actorId: string, detail: string } | null
    return row ? { actorId: row.actorId, detail: JSON.parse(row.detail) } as T : undefined
  }
  finally {
    database.close()
  }
}

interface Listed {
  id: string
  name: string
  price: number
  accessKind: string | null
  archived: boolean
  everSold: boolean
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

async function add(body: Record<string, unknown>, as = officer.cookie): Promise<Response> {
  return send('POST', '/api/admin/ticket-types', body, as)
}

// The whole list, not the first page: an absence assertion over one page passes for the wrong
// reason as soon as the suite has made more types than a page holds.
async function listing(query = '', as = officer.cookie): Promise<Listed[]> {
  const answered = await send('GET', `/api/admin/ticket-types?pageSize=100${query}`, undefined, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { items: Listed[] }).items
}

describe.skipIf(skip !== null)('a ticket type is global and uniquely named (criterion 1)', () => {
  test('a type carries a name and a base price in pence', async () => {
    const name = named('Standard')
    const answered = await add({ name, price: 700 })
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const found = (await listing()).find(type => type.id === id)
    expect(found).toMatchObject({ name, price: 700, archived: false, everSold: false })
  })

  test('the name is held once whatever the capitals, and the refusal names the holder', async () => {
    const name = named('Concession')
    expect((await add({ name, price: 500 })).status).toBe(200)

    const again = await add({ name: name.toUpperCase(), price: 500 })
    expect(again.status).toBe(409)
    expect((await again.json() as { statusMessage?: string, message?: string }).message).toContain(name)
  })

  test('pounds typed into a field that takes pence are refused', async () => {
    expect((await add({ name: named('Fractional'), price: 7.5 })).status).toBe(400)
    expect((await add({ name: named('Negative'), price: -100 })).status).toBe(400)
  })

  test('a list endpoint answers with an envelope, never a bare array', async () => {
    const answered = await send('GET', '/api/admin/ticket-types?page=1&pageSize=2')
    const envelope = await answered.json() as Record<string, unknown>
    expect(Object.keys(envelope).sort()).toEqual(['items', 'page', 'pageSize', 'pages', 'total'])
  })

  // The count and the rows answer the same question, or the screen says one thing and shows
  // another as soon as a house has more types than a page holds.
  test('the search and the page window are applied in SQL, and the total agrees', async () => {
    const name = named('Findable')
    expect((await add({ name, price: 300 })).status).toBe(200)

    const found = await (await send('GET', `/api/admin/ticket-types?search=${encodeURIComponent(name.toLowerCase())}`))
      .json() as { items: Listed[], total: number, pages: number }
    expect(found.total).toBe(1)
    expect(found.items.map(type => type.name)).toEqual([name])

    const paged = await (await send('GET', '/api/admin/ticket-types?pageSize=1')).json() as { items: Listed[], total: number, pages: number }
    expect(paged.items.length).toBe(1)
    expect(paged.pages).toBe(paged.total)
  })
})

describe.skipIf(skip !== null)('archived, never destroyed, once anything sold under it (criteria 2 and 3)', () => {
  test('an archived type leaves the list new sales read and stays in the console', async () => {
    const name = named('Retiring')
    const { id } = await (await add({ name, price: 600 })).json() as { id: string }

    expect((await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: true })).status).toBe(200)

    expect((await listing('&includeArchived=false')).map(type => type.id)).not.toContain(id)
    expect((await listing()).find(type => type.id === id)).toMatchObject({ name, archived: true })
  })

  test('archiving twice is refused rather than silently accepted', async () => {
    const { id } = await (await add({ name: named('Once'), price: 600 })).json() as { id: string }
    expect((await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: true })).status).toBe(200)
    expect((await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: true })).status).toBe(409)
  })

  test('an archived type can be put back, and the trail says which way it went', async () => {
    const { id } = await (await add({ name: named('Returning'), price: 600 })).json() as { id: string }
    await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: true })
    expect((await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: false })).status).toBe(200)

    expect((await listing()).find(type => type.id === id)?.archived).toBe(false)
    expect(trail('ticket-type.restored', `ticket-type:${id}`)).toBeDefined()
  })

  test('a type nothing has ever been sold under is deleted outright', async () => {
    const { id } = await (await add({ name: named('Mistake'), price: 100 })).json() as { id: string }
    expect((await send('DELETE', `/api/admin/ticket-types/${id}`)).status).toBe(200)

    expect((await listing()).map(type => type.id)).not.toContain(id)
    expect((await send('DELETE', `/api/admin/ticket-types/${id}`)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('an access or companion type is flagged (criterion 4)', () => {
  test('the console sees the flag, because it is what the console is for', async () => {
    const name = named('Access')
    const { id } = await (await add({ name, price: 700, accessKind: 'ACCESS' })).json() as { id: string }
    expect((await listing()).find(type => type.id === id)?.accessKind).toBe('ACCESS')
  })

  test('a companion type prices at nought and is flagged as one', async () => {
    const { id } = await (await add({ name: named('Companion'), price: 0, accessKind: 'COMPANION' })).json() as { id: string }
    expect((await listing()).find(type => type.id === id)).toMatchObject({ price: 0, accessKind: 'COMPANION' })
  })

  test('an access kind nobody defined is refused', async () => {
    expect((await add({ name: named('Carer'), price: 0, accessKind: 'CARER' })).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('creation, archive and price changes are audited (criterion 5)', () => {
  test('creation names the actor and what was created', async () => {
    const name = named('Audited')
    const { id } = await (await add({ name, price: 900 })).json() as { id: string }

    const entry = trail<{ actorId: string, detail: { name: string, price: number } }>('ticket-type.created', `ticket-type:${id}`)
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail).toMatchObject({ name, price: 900 })
  })

  // The base price is a column and a ticket keeps what it sold at, so the before and after are
  // the trail's to hold (D-120 criterion 3).
  test('a price change records the old and the new figure, both in pence', async () => {
    const name = named('Repriced')
    const { id } = await (await add({ name, price: 700 })).json() as { id: string }

    expect((await send('PUT', `/api/admin/ticket-types/${id}`, { name, price: 850 })).status).toBe(200)

    const entry = trail<{ actorId: string, detail: { changes: { price: { from: number, to: number } } } }>(
      'ticket-type.price.changed',
      `ticket-type:${id}`,
    )
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail.changes.price).toEqual({ from: 700, to: 850 })
    expect((await listing()).find(type => type.id === id)?.price).toBe(850)
  })

  test('an edit that leaves the price alone writes no price change', async () => {
    const name = named('Renamed')
    const { id } = await (await add({ name, price: 700 })).json() as { id: string }
    expect((await send('PUT', `/api/admin/ticket-types/${id}`, { name: `${name} again`, price: 700 })).status).toBe(200)

    expect(trail('ticket-type.price.changed', `ticket-type:${id}`)).toBeUndefined()
    expect(trail('ticket-type.updated', `ticket-type:${id}`)).toBeDefined()
  })

  test('archiving records the state it moved between', async () => {
    const { id } = await (await add({ name: named('Filed'), price: 300 })).json() as { id: string }
    await send('POST', `/api/admin/ticket-types/${id}/archive`, { archived: true })

    const entry = trail<{ detail: { changes: { archived: { from: boolean, to: boolean } } } }>(
      'ticket-type.archived',
      `ticket-type:${id}`,
    )
    expect(entry?.detail.changes.archived).toEqual({ from: false, to: true })
  })

  test('an edit cannot change what a sold ticket was sold under', async () => {
    const name = named('Fixed')
    const { id } = await (await add({ name, price: 700, kind: 'SINGLE' })).json() as { id: string }
    await send('PUT', `/api/admin/ticket-types/${id}`, { name, price: 700, kind: 'PASS_ADMISSION', accessKind: 'ACCESS' })

    const found = (await listing()).find(type => type.id === id)
    expect(found?.accessKind).toBeNull()
  })
})

describe.skipIf(skip !== null)('who may administer the programme', () => {
  test('the box office officer may, and it is their screen', async () => {
    const name = named('Officer made')
    expect((await add({ name, price: 400 }, boxOffice.cookie)).status).toBe(200)
    expect((await listing('', boxOffice.cookie)).some(type => type.name === name)).toBe(true)
  })

  test('an ordinary member reads nothing and writes nothing', async () => {
    expect((await send('GET', '/api/admin/ticket-types', undefined, member.cookie)).status).toBe(403)
    expect((await add({ name: named('Sneaked'), price: 100 }, member.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/ticket-types', undefined, '')).status)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('the box office officer sees the types and their prices in pounds', async () => {
    const name = named('On screen')
    expect((await add({ name, price: 1250 })).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', boxOffice.email)
    await fill(view, 'form input[type="password"]', boxOfficePassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    // The console shell renders no <main>, so the screen names an element of its own.
    await visit(view, `${app.baseURL}/box-office/ticket-types`, '[data-test="ticket-types-table"]')

    const text = await textOf(view, '[data-test="ticket-types-table"]')
    expect(text).toContain(name)
    expect(text).toContain('£12.50')
    view.close()
  }, 120_000)
})
