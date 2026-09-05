import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { showNightOf } from '#shared/utils/show-night'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// E-103. Eligibility is computed live against training records at request time, no cache and no
// fail-open path (criterion 1); an unnamed or unreadable rule refuses rather than admits everyone (criterion 4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let member: TestMember
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  member = await registerMember(app, 'rota-member', generatePassword())

  department = `ROT${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Rota gating' })).status)
    .toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(): Promise<string> {
  const id = `${department}-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
  })
  expect(answered.status).toBe(200)
  return id
}

async function gate(role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', moduleId: string | null): Promise<void> {
  const key = `SHIFT_ELIGIBILITY_${role}_MODULE`
  const answered = await send('PUT', `/api/admin/config/${key}`, { value: moduleId })
  expect(answered.status).toBe(200)
}

// Awarded directly: G-105's own suite proves the signup path, this suite only needs a held record.
// Awarded a month back, so an expiry set in the past still satisfies expires_on > awarded_on.
function award(userId: string, moduleId: string, expiresOn: string | null = null): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source)
      VALUES (?, ?, ?, ?, ?, 'SIGNOFF')
    `).run(`tr-${crypto.randomUUID().slice(0, 8)}`, userId, moduleId, daysFrom(-30), expiresOn)
  }
  finally {
    database.close()
  }
}

function stampOpen(performanceId: string, role: string, slot: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, \'OPEN\')')
      .run(`${performanceId}-${role}-${slot}`, performanceId, role, slot)
  }
  finally {
    database.close()
  }
}

// A week out, so the list's own "not yet started" filter never makes a fixture flicker out from
// under a test depending what time of day the suite happens to run (unlike "tonight").
function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const night = showNightOf(new Date(Date.now() + 7 * 86_400_000))
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix, night })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

interface OpenShift {
  shiftId: string
  role: string
  eligible: boolean
  unlockedBy: { moduleId: string, moduleName: string } | null
}

interface Listed { items: OpenShift[], page: number, pageSize: number, total: number, pages: number }

async function shiftsFor(as: string, query: Record<string, string> = {}): Promise<Listed> {
  const search = new URLSearchParams(query).toString()
  const answered = await send('GET', `/api/rota/shifts${search ? `?${search}` : ''}`, undefined, as)
  expect(answered.status).toBe(200)
  return await answered.json() as Listed
}

describe.skipIf(skip !== null)('an unnamed rule refuses eligibility rather than admitting everyone (criterion 4)', () => {
  test('a role with no gating module configured lists as ineligible', async () => {
    const house = programme('gate-unset')
    stampOpen(house.performanceId, 'DOOR', 1)

    const listed = await shiftsFor(member.cookie, { role: 'DOOR' })
    const shift = listed.items.find(item => item.shiftId === `${house.performanceId}-DOOR-1`)
    expect(shift?.eligible).toBe(false)
    expect(shift?.unlockedBy).toBeNull()
  })
})

describe.skipIf(skip !== null)('a named rule refuses without the module, and names it (criteria 2 and 4)', () => {
  test('the shift names the module that would unlock it', async () => {
    const module = await addModule()
    await gate('BAR', module)

    const house = programme('gate-named')
    stampOpen(house.performanceId, 'BAR', 1)

    const listed = await shiftsFor(member.cookie, { role: 'BAR' })
    const shift = listed.items.find(item => item.shiftId === `${house.performanceId}-BAR-1`)
    expect(shift?.eligible).toBe(false)
    expect(shift?.unlockedBy?.moduleId).toBe(module)

    await gate('BAR', null)
  })

  test('holding the named module makes the shift eligible, expiring included (criterion 3)', async () => {
    const module = await addModule()
    await gate('DOOR', module)
    award(member.id, module, daysFrom(10))

    const house = programme('gate-held')
    stampOpen(house.performanceId, 'DOOR', 1)

    const listed = await shiftsFor(member.cookie, { role: 'DOOR' })
    const shift = listed.items.find(item => item.shiftId === `${house.performanceId}-DOOR-1`)
    expect(shift?.eligible).toBe(true)
    expect(shift?.unlockedBy).toBeNull()

    await gate('DOOR', null)
  })

  test('a revoked or expired record does not count as held', async () => {
    const module = await addModule()
    await gate('DOOR', module)
    award(member.id, module, daysFrom(-1))

    const house = programme('gate-expired')
    stampOpen(house.performanceId, 'DOOR', 1)

    const listed = await shiftsFor(member.cookie, { role: 'DOOR' })
    const shift = listed.items.find(item => item.shiftId === `${house.performanceId}-DOOR-1`)
    expect(shift?.eligible).toBe(false)

    await gate('DOOR', null)
  })
})

describe.skipIf(skip !== null)('the list pages in SQL (criterion 5)', () => {
  test('the envelope carries page, pageSize, total and pages', async () => {
    const listed = await shiftsFor(member.cookie)
    expect(listed).toMatchObject({ page: 1, pageSize: 25 })
    expect(typeof listed.total).toBe('number')
    expect(typeof listed.pages).toBe('number')
  })
})

describe.skipIf(skip !== null)('a member\'s own shifts', () => {
  test('claimed and confirmed shifts held by the caller come back, and nobody else\'s', async () => {
    const house = programme('mine')
    const other = await registerMember(app, 'rota-other', generatePassword())

    const database = new Database(app.databaseFile)
    try {
      database.query(`INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, 'CONFIRMED')`)
        .run(`${house.performanceId}-mine`, house.performanceId, 'DOOR', member.id)
      database.query(`INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, 'CONFIRMED')`)
        .run(`${house.performanceId}-other`, house.performanceId, 'BAR', other.id)
    }
    finally {
      database.close()
    }

    const answered = await send('GET', '/api/rota/mine', undefined, member.cookie)
    expect(answered.status).toBe(200)
    const { items } = await answered.json() as { items: { shiftId: string }[] }
    expect(items.map(item => item.shiftId)).toContain(`${house.performanceId}-mine`)
    expect(items.map(item => item.shiftId)).not.toContain(`${house.performanceId}-other`)
  })
})

describe.skipIf(skip !== null)('the screen a member reads their rota from', () => {
  test('a locked shift names what would unlock it, linking to the module', async () => {
    const module = await addModule()
    await gate('DOOR', module)

    const house = programme('screen-locked')
    stampOpen(house.performanceId, 'DOOR', 1)

    const password = generatePassword()
    const person = await registerMember(app, 'rota-screen', password)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', person.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/rota`, '[data-test="open-shifts-list"]')
      const shown = await textOf(view, `[data-test="open-shift-${house.performanceId}-DOOR-1"]`)
      expect(shown).toContain('Locked')
      expect(shown).toContain(`Module ${module}`)
    }
    finally {
      view.close()
      await gate('DOOR', null)
    }
  }, 120_000)
})
