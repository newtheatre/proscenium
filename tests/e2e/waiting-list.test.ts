import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { click, fill, letters, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-113 criteria 1 and 4 through the real routes and the real screens. The statements themselves
// are pinned in tests/integration/waiting-list.test.ts.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  venueId = venue()
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

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 1 }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

async function bookableShow(): Promise<{ showId: string, performanceId: string }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id

  await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { showId, performanceId }
}

function entriesFor(performanceId: string): { id: string, status: string }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT id, status FROM waiting_list WHERE performance_id = ?').all(performanceId) as { id: string, status: string }[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a join is committed only alongside a link the joiner holds (criterion 1)', () => {
  test('the answer says the letter went, and the letter carries the leave link', async () => {
    const { performanceId } = await bookableShow()
    const email = `waiter-${crypto.randomUUID().slice(0, 8)}@example.invalid`

    const answered = await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId,
      partySize: 2,
      guest: { name: 'Ada Waiter', email },
    }, '')

    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ ok: true, emailed: true })

    const entries = entriesFor(performanceId)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('WAITING')

    const letter = (await letters(app)).find(text => text.includes(email))
    expect(letter).toBeDefined()
    expect(letter).toContain('/waiting-list/leave/')
  }, CASE_TIMEOUT_MS)

  test('a second join on the same address is refused and writes nothing more', async () => {
    const { performanceId } = await bookableShow()
    const email = `twice-${crypto.randomUUID().slice(0, 8)}@example.invalid`
    const body = { performanceId, partySize: 1, guest: { name: 'Ada Twice', email } }

    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, body, '')).status).toBe(200)
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, body, '')).status).toBe(409)
    expect(entriesFor(performanceId)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('leaving with a link that no longer works says so (criterion 4)', () => {
  test('the remove route refuses an unknown token', async () => {
    const answered = await send('POST', '/api/waiting-list/not-a-real-token/remove', {}, '')
    expect(answered.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('the leave page shows a notice rather than nothing at all', async () => {
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/waiting-list/leave/not-a-real-token`, '[data-test="waiting-list-leave-page"]')

    await click(view, '[data-test="waiting-list-leave-confirm"]')
    await waitFor(view, `document.querySelector('[data-test="waiting-list-leave-notice"]')`)
    expect(await textOf(view, '[data-test="waiting-list-leave-notice"]')).toContain('no longer valid')
  }, CASE_TIMEOUT_MS)

  test('a real link leaves the list, and using it again still says so', async () => {
    const { performanceId } = await bookableShow()
    const email = `leaver-${crypto.randomUUID().slice(0, 8)}@example.invalid`

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/waiting-list/${performanceId}`, '[data-test="waiting-list-join-page"]')
    await fill(view, '[data-test="waiting-list-guest-name"]', 'Ada Leaver')
    await fill(view, '[data-test="waiting-list-guest-email"]', email)
    await click(view, '[data-test="waiting-list-submit"]')
    await waitFor(view, `document.querySelector('[data-test="waiting-list-joined"]')`)

    const letter = (await letters(app)).find(text => text.includes(email)) ?? ''
    const leaveUrl = letter.match(/https?:\/\/\S*\/waiting-list\/leave\/\S+/)?.[0]
    expect(leaveUrl).toBeDefined()

    await visit(view, leaveUrl!, '[data-test="waiting-list-leave-page"]')
    await click(view, '[data-test="waiting-list-leave-confirm"]')
    await waitFor(view, `document.querySelector('[data-test="waiting-list-left"]')`)

    expect(entriesFor(performanceId)[0]?.status).toBe('REMOVED')
  }, CASE_TIMEOUT_MS)
})
