import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1521: the page a show-night screen serves, before any script runs, is already the viewer's
// own. A hub that serves every tile and then prunes them is the flicker the issue reported.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let door: TestMember
let dutyManager: TestMember
let bar: TestMember
let nobody: TestMember
let productId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  door = await registerMember(app, 'first-paint-door', generatePassword())
  dutyManager = await registerMember(app, 'first-paint-dm', generatePassword())
  bar = await registerMember(app, 'first-paint-bar', generatePassword())
  nobody = await registerMember(app, 'first-paint-nobody', generatePassword())

  const database = new Database(app.databaseFile)
  let venueId: string
  try {
    const target = sqliteTarget(database)
    venueId = testVenue(target, { suffix: 'first-paint' }).id
    const performanceId = tonightsPerformance(target, { suffix: 'first-paint', venueId }).performanceId
    const shift = database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)')
    shift.run('first-paint-door-shift', performanceId, 'DOOR', door.id, 'CONFIRMED')
    shift.run('first-paint-dm-shift', performanceId, 'DUTY_MANAGER', dutyManager.id, 'CONFIRMED')
    shift.run('first-paint-bar-shift', performanceId, 'BAR', bar.id, 'CONFIRMED')
  }
  finally {
    database.close()
  }

  // Tonight's till open, and one priced size on it, so the grid has something to serve.
  const officer = await adminSession(app)
  const made = async (path: string, body: Record<string, unknown>): Promise<string> =>
    (await (await request(app, 'POST', path, body, officer.cookie)).json() as { id: string }).id
  const categoryId = await made('/api/admin/bar/categories', { name: 'First paint spirits' })
  productId = await made('/api/admin/bar/products', { name: 'First paint gin', categoryId })
  const variantId = await made('/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const itemId = await made('/api/admin/bar/items', { name: 'First paint gin bottle', unit: 'ML', containerMl: 700 })
  await request(app, 'PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] }, officer.cookie)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await request(app, 'POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 250, effectiveFrom: today }, officer.cookie)
  expect((await request(app, 'POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' }, officer.cookie)).status).toBe(200)
  expect((await request(app, 'POST', '/api/till', { venueId }, bar.cookie)).status).toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// The HTML the server sends, which is what a phone paints before hydration can change anything.
async function served(path: string, who: TestMember): Promise<string> {
  const answered = await fetch(`${app.baseURL}${path}`, { headers: { cookie: who.cookie } })
  expect(answered.status).toBe(200)
  return answered.text()
}

function tilesIn(html: string): { id: string, gold: boolean }[] {
  return [...html.matchAll(/<a\b[^>]*\bdata-test="tile-([\w-]+)"[^>]*>/g)]
    .map(tag => ({ id: tag[1]!, gold: /\bbg-secondary\b/.test(tag[0]) }))
}

const marks = (html: string, test: string): boolean => html.includes(`data-test="${test}"`)

// What the refusal card's help line says, as served.
function helpLineIn(html: string): string {
  return /data-test="night-refusal-help"[^>]*>([^<]*)</.exec(html)?.[1]?.trim() ?? ''
}

describe.skipIf(skip !== null)('the hub serves the viewer\'s own tiles (issue 1521)', () => {
  test('a door shift is served the door\'s tiles alone, the door first and in gold', async () => {
    const html = await served('/tonight', door)
    expect(tilesIn(html)).toEqual([
      { id: 'door', gold: true },
      { id: 'glance', gold: false },
      { id: 'age-checks', gold: false },
      { id: 'contacts', gold: false },
      { id: 'emergency', gold: false },
    ])
    expect(marks(html, 'hub-no-role')).toBe(false)
  })

  test('the house numbers and the on-shift badge are in the served page', async () => {
    const html = await served('/tonight', door)
    expect(marks(html, 'tonight-kpis')).toBe(true)
    expect(marks(html, 'night-shift-badge')).toBe(true)
    expect(html).toContain('Last synced')
    expect(html).not.toContain('Syncing')
  })

  test('the duty manager is served the glance first and in gold', async () => {
    const [first] = tilesIn(await served('/tonight', dutyManager))
    expect(first).toEqual({ id: 'glance', gold: true })
  })

  test('nobody on shift is served one card and Emergency, never every tile', async () => {
    const html = await served('/tonight', nobody)
    expect(marks(html, 'hub-no-role')).toBe(true)
    expect(tilesIn(html).map(tile => tile.id)).toEqual(['emergency'])
    expect(marks(html, 'night-shift-badge')).toBe(false)
  })
})

describe.skipIf(skip !== null)('each show-night screen serves what the viewer will use (issue 1521)', () => {
  test('the glance serves the duty manager\'s controls to the duty manager and to nobody else', async () => {
    const forManager = await served('/tonight/glance', dutyManager)
    expect(marks(forManager, 'glance-numbers')).toBe(true)
    expect(marks(forManager, 'board-code')).toBe(true)

    const forDoor = await served('/tonight/glance', door)
    expect(marks(forDoor, 'glance-numbers')).toBe(true)
    expect(marks(forDoor, 'board-code')).toBe(false)
  })

  test('the door serves its field to the door and one refusal card to anyone else', async () => {
    const forDoor = await served('/tonight/door', door)
    expect(marks(forDoor, 'door-reference')).toBe(true)
    expect(marks(forDoor, 'door-not-authorised')).toBe(false)
    expect(marks(forDoor, 'door-strip')).toBe(true)

    const forNobody = await served('/tonight/door', nobody)
    expect(marks(forNobody, 'night-refusal')).toBe(true)
    expect(marks(forNobody, 'door-reference')).toBe(false)
  })

  test('the board serves a refusal, and none of its controls, to a door shift', async () => {
    const html = await served('/tonight/board', door)
    expect(marks(html, 'night-refusal')).toBe(true)
    expect(marks(html, 'board-free-text-form')).toBe(false)
  })

  test('the checklist serves the list to the duty manager and a refusal to the door', async () => {
    const forManager = await served('/tonight/checklist', dutyManager)
    expect(marks(forManager, 'checklist-list')).toBe(true)
    expect(forManager).toContain('Last synced')

    expect(marks(await served('/tonight/checklist', door), 'night-refusal')).toBe(true)
  })

  test('contacts and incidents serve tonight\'s team and the log, or one refusal card', async () => {
    const forDoor = await served('/tonight/incidents', door)
    expect(marks(forDoor, 'team-DOOR')).toBe(true)
    expect(marks(forDoor, 'incidents-list')).toBe(true)
    expect(forDoor).not.toContain('Nobody is on the rota tonight yet.')

    expect(marks(await served('/tonight/incidents', nobody), 'night-refusal')).toBe(true)
  })

  test('the Challenge 25 register serves the register, or one refusal card', async () => {
    const forDoor = await served('/tonight/age-checks', door)
    expect(marks(forDoor, 'age-checks-list')).toBe(true)
    expect(marks(forDoor, 'age-checks-authority-failure')).toBe(false)

    expect(marks(await served('/tonight/age-checks', nobody), 'night-refusal')).toBe(true)
  })

  test('the audience message serves the form and its count to the duty manager, and a refusal to the door', async () => {
    const forManager = await served('/tonight/message', dutyManager)
    expect(marks(forManager, 'night-message-subject')).toBe(true)
    expect(forManager).not.toContain('Counting who that is')

    const forDoor = await served('/tonight/message', door)
    expect(marks(forDoor, 'night-refusal')).toBe(true)
    expect(marks(forDoor, 'night-message-subject')).toBe(false)
  })
})

describe.skipIf(skip !== null)('the night report, the till and the stocktake serve what the viewer will use (issue 1521)', () => {
  test('the night report serves tonight\'s draft to the duty manager, with nothing left settling', async () => {
    const html = await served('/tonight/report', dutyManager)
    expect(marks(html, 'report-draft')).toBe(true)
    expect(html).toContain('Walk-ups')
    expect(html).toContain('Last synced')
    expect(html).not.toContain('Syncing')
    expect(marks(html, 'night-refusal')).toBe(false)
    expect(marks(html, 'report-failure')).toBe(false)
  })

  test('the night report serves one refusal card, and no draft, to a door shift', async () => {
    const html = await served('/tonight/report', door)
    expect(marks(html, 'night-refusal')).toBe(true)
    expect(marks(html, 'report-draft')).toBe(false)
    expect(marks(html, 'report-failure')).toBe(false)
  })

  test('the till serves tonight\'s open session and its grid to the bar shift, and no Open till', async () => {
    const html = await served('/tonight/till', bar)
    expect(marks(html, 'till-open')).toBe(true)
    expect(marks(html, `product-${productId}`)).toBe(true)
    expect(marks(html, 'till-closed')).toBe(false)
    expect(html).not.toContain('Open till')
    expect(html).toContain('Last synced')
    expect(html).not.toContain('Syncing')
  })

  test('the till serves one refusal card, and none of the till, to anyone else', async () => {
    const html = await served('/tonight/till', nobody)
    expect(marks(html, 'night-refusal')).toBe(true)
    expect(marks(html, 'till-open')).toBe(false)
    expect(marks(html, 'till-closed')).toBe(false)
    expect(html).not.toContain('Open till')
  })

  test('the stocktake serves its answer to the bar shift and one refusal card to anyone else', async () => {
    const forBar = await served('/tonight/stocktake', bar)
    expect(marks(forBar, 'no-stocktake')).toBe(true)
    expect(marks(forBar, 'night-refusal')).toBe(false)

    expect(marks(await served('/tonight/stocktake', nobody), 'night-refusal')).toBe(true)
  })

  test('a refusal card serves tonight\'s duty manager by name to somebody on tonight\'s team', async () => {
    const html = await served('/tonight/board', door)
    expect(helpLineIn(html)).toMatch(/^Ask [^,]+, tonight(&#39;|')s duty manager\.$/)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
