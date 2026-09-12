import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-126 pass mode: the holder is found by name or reference, the card says what the pass covers
// and what tonight already holds, and Admit is refused with the reason read off the card.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let doorPassword: string
let door: TestMember
let performanceId: string
let showId: string

// One venue running one performance for the whole suite: an officer resolving authority over two
// venues at once is refused by design, and the screen has no venue picker to answer with.
beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  doorPassword = generatePassword()
  door = await registerMember(app, 'door-pass-mode', doorPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    const venueId = testVenue(target, { suffix: 'door-pass-mode' }).id
    const made = tonightsPerformance(target, { suffix: 'door-pass-mode', venueId })
    performanceId = made.performanceId
    showId = made.showId
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = door.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

interface Fixture { reference: string, holder: TestMember }

// A pass on tonight's one performance, held by a member whose name the search has to find.
async function aPass(options: { expired?: boolean, covers?: boolean } = {}): Promise<Fixture> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const holder = await registerMember(app, `pass-holder-${suffix}`, generatePassword())
  const now = Math.floor(Date.now() / 1000)
  const passTypeId = `pt-mode-${suffix}`
  const reference = suffix.toUpperCase().slice(0, 6)
  const from = options.expired ? now - 10_000 : now - 1_000
  const until = options.expired ? now - 5_000 : now + 1_000

  write('INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
    passTypeId, passTypeId, `Season pass ${suffix}`, from, until, 'ON_SALE')
  write('INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', `${passTypeId}-price`, passTypeId, 'Standard')
  if (options.covers !== false) {
    write('INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${passTypeId}-show`, passTypeId, showId)
  }
  write(`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
         VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', ?)`, `pass-mode-${suffix}`, reference, passTypeId, `${passTypeId}-price`, holder.id, holder.id)

  return { reference, holder }
}

interface Card {
  reference: string
  holderName: string
  covers: string
  tonight: string
  admittedTonight: boolean
  refusal: string | null
}

const search = async (q: string): Promise<Card[]> => {
  const answered = await send('GET', `/api/tonight/door/passes/search?q=${encodeURIComponent(q)}&performanceId=${performanceId}`)
  expect(answered.status).toBe(200)
  return (await answered.json() as { items: Card[] }).items
}

describe.skipIf(skip !== null)('finding the holder (D-126 criterion 1)', () => {
  test('the reference on the pass finds it, with what it covers and what tonight holds', async () => {
    const { reference, holder } = await aPass()

    const [card] = await search(reference)
    expect(card?.reference).toBe(reference)
    expect(card?.holderName).toBe(holder.name)
    expect(card?.covers).toBe('1 show')
    expect(card?.tonight).toBe('Not yet redeemed')
    expect(card?.refusal).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('the holder\'s name finds it too, so nobody types a reference off a phone screen', async () => {
    const { reference, holder } = await aPass()
    const found = await search(holder.name.split(' ')[0]!)
    expect(found.map(one => one.reference)).toContain(reference)
  }, CASE_TIMEOUT_MS)

  test('a pass admitted tonight says so on the card, before anyone presses Admit', async () => {
    const { reference } = await aPass()
    expect((await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })).status).toBe(200)

    const [card] = await search(reference)
    expect(card?.tonight).toBe('Already admitted tonight')
    expect(card?.admittedTonight).toBe(true)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the card carries the refusal the scan would give (criterion 2)', () => {
  test('an expired pass is refused on the card, in the words the volunteer reads out', async () => {
    const { reference } = await aPass({ expired: true })
    const [card] = await search(reference)
    expect(card?.refusal).toBe('This pass has expired.')
  }, CASE_TIMEOUT_MS)

  test('a pass that does not cover tonight\'s show says exactly that', async () => {
    const { reference } = await aPass({ covers: false })
    const [card] = await search(reference)
    expect(card?.refusal).toBe('This pass does not cover this show.')
  }, CASE_TIMEOUT_MS)

  test('searching carries the door\'s own authority, and nobody else\'s', async () => {
    const { reference } = await aPass()
    const stranger = await registerMember(app, 'pass-mode-stranger', generatePassword())
    const answered = await send('GET', `/api/tonight/door/passes/search?q=${reference}&performanceId=${performanceId}`, undefined, stranger.cookie)
    expect(answered.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the screen at /tonight/door?mode=pass', () => {
  test('a search finds the holder, and Admit shows the verdict card', async () => {
    const { reference, holder } = await aPass()
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', door.email)
      await fill(view, 'form input[type="password"]', doorPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/tonight/door?mode=pass`, '[data-test="door-pass-mode"]')
      // D-126 criterion 2's wording stands whether or not a card is on screen.
      expect(await textOf(view, '[data-test="pass-refusal-panel"]')).toContain('always the bar')

      await fill(view, '[data-test="pass-search"]', reference)
      await waitFor(view, `document.querySelector('[data-test="pass-card-${reference}"]')`)

      const card = await textOf(view, `[data-test="pass-card-${reference}"]`)
      expect(card).toContain(holder.name)
      expect(card).toContain(reference)
      expect(card).toContain('Admit, party of 1')
      expect(card).toContain('£0 pass-admission ticket')

      // Admitting hands over to the door's own verdict card, so one admission reads the same
      // whichever way the reference arrived.
      await click(view, `[data-test="pass-admit-${reference}"]`)
      await waitFor(view, `document.querySelector('[data-test="door-verdict-paid"]')`)
      const verdict = await textOf(view, '[data-test="door-verdict"]')
      expect(verdict).toContain(reference)
      expect(verdict).toContain('PAID')
      expect(verdict).not.toContain('£')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
