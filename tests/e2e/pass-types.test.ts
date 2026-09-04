import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-123 through the real routes and the real screen. "Ever issued" and "live coverage" read
// empty until D-124's `passes` exists; the integration suite proves those predicates.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let manager: TestMember
let member: TestMember
const boxOfficePassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())

  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)

  // MANAGER carries `ticketing.manage` and neither `ticketing.read` nor `ticketing.write` (0009).
  manager = await registerMember(app, 'manager', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'MANAGER' }, officer.cookie)
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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const now = Math.floor(Date.now() / 1000)
const VALID_FROM = now
const VALID_UNTIL = now + 180 * 86_400

interface Listed {
  id: string
  slug: string
  name: string
  status: string
  validFrom: number
  validUntil: number
  maxIssued: number | null
  everIssued: boolean
  prices: { id: string, label: string, price: number }[]
  showIds: string[]
}

async function newShow(as = officer.cookie): Promise<string> {
  const title = named('The Seagull')
  const answered = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

function standardBody(name: string, showId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    slug: slugged(name),
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    prices: [{ label: 'Standard', price: 4500 }],
    showIds: [showId],
    ...over,
  }
}

async function addPassType(name: string, showId: string, over: Record<string, unknown> = {}, as = officer.cookie): Promise<Response> {
  return send('POST', '/api/admin/pass-types', standardBody(name, showId, over), as)
}

// The edit form takes no shows: they move through their own endpoint (D-123 criterion 4).
function editBody(name: string, showId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const { showIds: _showIds, ...body } = standardBody(name, showId, { status: 'DRAFT', ...over })
  return body
}

async function newPassType(over: Record<string, unknown> = {}): Promise<{ id: string, showId: string }> {
  const showId = await newShow()
  const answered = await addPassType(named('Season pass'), showId, over)
  expect(answered.status).toBe(200)
  return { id: (await answered.json() as { id: string }).id, showId }
}

// The whole list, not the first page: an absence assertion over one page passes for the wrong
// reason as soon as the suite has made more passes than a page holds.
async function listing(query = '', as = officer.cookie): Promise<Listed[]> {
  const answered = await send('GET', `/api/admin/pass-types?pageSize=100${query}`, undefined, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { items: Listed[] }).items
}

describe.skipIf(skip !== null)('a pass has a window, price points and covered shows (criterion 1)', () => {
  test('a well formed pass is created DRAFT, whatever the request asks', async () => {
    const showId = await newShow()
    const name = named('Season pass')
    const answered = await addPassType(name, showId)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const found = (await listing()).find(one => one.id === id)
    expect(found).toMatchObject({
      name,
      status: 'DRAFT',
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      everIssued: false,
      showIds: [showId],
    })
    expect(found?.prices).toMatchObject([{ label: 'Standard', price: 4500 }])
  })

  // The list carries what its own table needs; a single pass and every show it may be extended
  // to cover is a question of its own, for whatever screen asks it next.
  test('one pass reads back with the shows it may be extended to cover', async () => {
    const { id, showId } = await newPassType()
    const uncovered = await newShow()

    const answered = await send('GET', `/api/admin/pass-types/${id}`)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { passType: { id: string, showIds: string[] }, shows: { id: string }[] }
    expect(body.passType.id).toBe(id)
    expect(body.passType.showIds).toEqual([showId])
    expect(body.shows.map(one => one.id)).toEqual(expect.arrayContaining([showId, uncovered]))
  })

  test('an unknown pass is a 404', async () => {
    expect((await send('GET', '/api/admin/pass-types/no-such-pass')).status).toBe(404)
  })

  test('the address is held once, and the refusal names the holder', async () => {
    const showId = await newShow()
    const name = named('Concession pass')
    expect((await addPassType(name, showId)).status).toBe(200)

    const again = await addPassType(name, showId, { slug: slugged(name) })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(slugged(name))
  })

  test('a window that runs backwards is refused', async () => {
    const showId = await newShow()
    const answered = await addPassType(named('Backwards'), showId, { validFrom: VALID_UNTIL, validUntil: VALID_FROM })
    expect(answered.status).toBe(400)
  })

  test('an unknown show is refused rather than reaching the foreign key', async () => {
    const answered = await addPassType(named('Nowhere'), 'no-such-show')
    expect(answered.status).toBe(400)
  })

  test('a list endpoint answers with an envelope, never a bare array', async () => {
    const answered = await send('GET', '/api/admin/pass-types?page=1&pageSize=2')
    const envelope = await answered.json() as Record<string, unknown>
    expect(Object.keys(envelope).sort()).toEqual(['items', 'page', 'pageSize', 'pages', 'total'])
  })

  test('the search and the status filter are applied in SQL, and the total agrees', async () => {
    const showId = await newShow()
    const name = named('Findable')
    expect((await addPassType(name, showId)).status).toBe(200)

    const found = await (await send('GET', `/api/admin/pass-types?search=${encodeURIComponent(name.toLowerCase())}`))
      .json() as { items: Listed[], total: number }
    expect(found.total).toBe(1)
    expect(found.items.map(one => one.name)).toEqual([name])

    const drafts = await (await send('GET', '/api/admin/pass-types?status=DRAFT')).json() as { items: Listed[] }
    expect(drafts.items.some(one => one.name === name)).toBe(true)
    const onSale = await (await send('GET', '/api/admin/pass-types?status=ON_SALE')).json() as { items: Listed[] }
    expect(onSale.items.some(one => one.name === name)).toBe(false)
  })
})

describe.skipIf(skip !== null)('the cap is an explicit number or uncapped (criterion 2)', () => {
  test('uncapped round-trips as null', async () => {
    const { id } = await newPassType()
    expect((await listing()).find(one => one.id === id)?.maxIssued).toBeNull()
  })

  test('a cap round-trips as the figure it was set to', async () => {
    const { id } = await newPassType({ maxIssued: 40 })
    expect((await listing()).find(one => one.id === id)?.maxIssued).toBe(40)
  })
})

describe.skipIf(skip !== null)('closed, never destroyed, once anything has been issued (criterion 3)', () => {
  test('a pass nothing has ever been issued under is deleted outright', async () => {
    const { id } = await newPassType()
    expect((await send('DELETE', `/api/admin/pass-types/${id}`)).status).toBe(200)

    expect((await listing()).map(one => one.id)).not.toContain(id)
    expect((await send('DELETE', `/api/admin/pass-types/${id}`)).status).toBe(404)
  })

  test('closing leaves the pass resolvable in the console rather than removing it', async () => {
    const { id, showId } = await newPassType()
    const body = editBody('Closing', showId, { status: 'CLOSED' })
    expect((await send('PUT', `/api/admin/pass-types/${id}`, body)).status).toBe(200)

    const found = (await listing()).find(one => one.id === id)
    expect(found?.status).toBe('CLOSED')
  })
})

describe.skipIf(skip !== null)('covered shows extend freely; a removal is what a live pass will gate (criterion 4)', () => {
  test('adding a second show takes effect at once', async () => {
    const { id, showId } = await newPassType()
    const second = await newShow()

    expect((await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [showId, second] })).status).toBe(200)
    expect((await listing()).find(one => one.id === id)?.showIds.sort()).toEqual([showId, second].sort())
  })

  // Nothing can be live against a show until D-124 builds `passes`, so a removal succeeds today on
  // box office authority alone; the manager gate is proved against a stand-in in the integration suite.
  test('removing a show succeeds today, because nothing is ever live yet', async () => {
    const { id, showId } = await newPassType()
    const second = await newShow()
    await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [showId, second] })

    expect((await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [second] })).status).toBe(200)
    expect((await listing()).find(one => one.id === id)?.showIds).toEqual([second])
  })

  test('an unknown show is refused', async () => {
    const { id } = await newPassType()
    expect((await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: ['no-such-show'] })).status).toBe(400)
  })

  test('an empty set is refused: a pass covers at least one show', async () => {
    const { id } = await newPassType()
    expect((await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [] })).status).toBe(400)
  })

  // MANAGER holds `ticketing.manage` and no `ticketing.write` (0009); PRIVILEGED_ROLES is
  // narrowed for the request since this account carries no authenticator and A-112 is not what this proves.
  test('a manager reaches the route on `ticketing.manage` alone', async () => {
    const { id, showId } = await newPassType()
    const second = await newShow()

    await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN'] })
    try {
      const answered = await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [showId, second] }, manager.cookie)
      expect(answered.status).toBe(200)
    }
    finally {
      await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER'] })
    }
  })
})

describe.skipIf(skip !== null)('creation and changes are audited (criterion 5)', () => {
  test('creation names the actor, the address and the price points', async () => {
    const showId = await newShow()
    const name = named('Audited')
    const answered = await addPassType(name, showId)
    const { id } = await answered.json() as { id: string }

    const entry = trail<{ actorId: string, detail: { name: string, slug: string } }>('pass-type.created', `pass-type:${id}`)
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail).toMatchObject({ name, slug: slugged(name) })
  })

  test('an edit records the old and new figure for every field that moved', async () => {
    const { id, showId } = await newPassType()
    const renamed = named('Renamed pass')
    const body = editBody(renamed, showId, { maxIssued: 80 })
    expect((await send('PUT', `/api/admin/pass-types/${id}`, body)).status).toBe(200)

    const entry = trail<{ detail: { changes: { name: { from: string, to: string }, maxIssued: { from: null, to: number } } } }>(
      'pass-type.updated',
      `pass-type:${id}`,
    )
    expect(entry?.detail.changes.name.to).toBe(renamed)
    expect(entry?.detail.changes.maxIssued).toEqual({ from: null, to: 80 })
  })

  // The prose itself never reaches the trail (0011), but a description-only edit still has to
  // read as a change rather than as nothing having happened.
  test('a description-only edit still records that something moved', async () => {
    const { id, showId } = await newPassType()
    const body = editBody('Described', showId, { description: 'Covers every mainstage show this season' })
    expect((await send('PUT', `/api/admin/pass-types/${id}`, body)).status).toBe(200)

    const entry = trail<{ detail: { descriptionChanged: boolean } }>('pass-type.updated', `pass-type:${id}`)
    expect(entry?.detail.descriptionChanged).toBe(true)
  })

  test('a covered-shows change records what was added and what was removed', async () => {
    const { id, showId } = await newPassType()
    const second = await newShow()
    expect((await send('PUT', `/api/admin/pass-types/${id}/shows`, { showIds: [second] })).status).toBe(200)

    const entry = trail<{ detail: { added: string[], removed: string[] } }>('pass-type.shows.updated', `pass-type:${id}`)
    expect(entry?.detail.added).toEqual([second])
    expect(entry?.detail.removed).toEqual([showId])
  })
})

describe.skipIf(skip !== null)('who may administer the passes', () => {
  test('the box office officer may, and it is their screen', async () => {
    const showId = await newShow(boxOffice.cookie)
    const name = named('Officer made')
    expect((await addPassType(name, showId, {}, boxOffice.cookie)).status).toBe(200)
    expect((await listing('', boxOffice.cookie)).some(one => one.name === name)).toBe(true)
  })

  test('an ordinary member reads nothing and writes nothing', async () => {
    expect((await send('GET', '/api/admin/pass-types', undefined, member.cookie)).status).toBe(403)
    expect((await addPassType(named('Sneaked'), 'no-such-show', {}, member.cookie)).status).toBe(403)
  })

  // The narrow grant stays narrow: it opens the one route it names, not the whole console (0009).
  test('a manager alone still cannot read the listing or create one', async () => {
    expect((await send('GET', '/api/admin/pass-types', undefined, manager.cookie)).status).toBe(403)
    expect((await addPassType(named('Overreach'), 'no-such-show', {}, manager.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/pass-types', undefined, '')).status)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('the box office officer sees the pass and its price points in pounds', async () => {
    const showId = await newShow()
    const name = named('On screen')
    expect((await addPassType(name, showId, { prices: [{ label: 'Standard', price: 1250 }] })).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', boxOffice.email)
    await fill(view, 'form input[type="password"]', boxOfficePassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/box-office/pass-types`, '[data-test="pass-types-table"]')

    const text = await textOf(view, '[data-test="pass-types-table"]')
    expect(text).toContain(name)
    expect(text).toContain('£12.50')
    view.close()
  }, 120_000)
})
