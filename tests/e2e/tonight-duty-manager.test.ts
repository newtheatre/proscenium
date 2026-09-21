import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-112 through the real route. House-number arithmetic and the roster's consent gate are pinned
// in `tests/integration/tonight.test.ts`; this is the guard, the wiring and the real content.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
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

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Tonight, unnarrowed: DUTY_MANAGER authority is tonight's own, so the fixture has to sit inside
// the night the route itself resolves, not an arbitrary day out.
function performance(suffix: string): { performanceId: string, showId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { performanceId: made.performanceId, showId: made.showId }
  }
  finally {
    database.close()
  }
}

function shift(performanceId: string, role: string, userId: string, status = 'CONFIRMED'): void {
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
    `${performanceId}-${role}`, performanceId, role, userId, status)
}

describe.skipIf(skip !== null)('the duty manager\'s tonight screen (E-112 criteria 1 and 2)', () => {
  test('a confirmed duty manager sees tonight\'s performance and its team', async () => {
    const dm = await registerMember(app, 'dm-tonight', generatePassword())
    const door = await registerMember(app, 'door-tonight', generatePassword())
    const house = performance('dm-screen')
    shift(house.performanceId, 'DUTY_MANAGER', dm.id)
    shift(house.performanceId, 'DOOR', door.id)

    const answered = await send('GET', '/api/tonight/duty-manager', undefined, dm.cookie)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { performances: { performanceId: string, team: { role: string, filled: boolean, name: string | null }[], house: { sold: number, admitted: number } }[] }
    const seen = body.performances.find(one => one.performanceId === house.performanceId)
    expect(seen).toBeDefined()
    expect(seen!.house).toMatchObject({ sold: 0, admitted: 0 })

    const doorRow = seen!.team.find(member => member.role === 'DOOR')
    expect(doorRow).toMatchObject({ filled: true, name: door.name })
  })

  test('an unfilled slot never shows a blank name', async () => {
    const dm = await registerMember(app, 'dm-unfilled', generatePassword())
    const house = performance('dm-unfilled')
    shift(house.performanceId, 'DUTY_MANAGER', dm.id)
    write('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
      `${house.performanceId}-BAR`, house.performanceId, 'BAR', 'OPEN')

    const body = await (await send('GET', '/api/tonight/duty-manager', undefined, dm.cookie)).json() as
      { performances: { performanceId: string, team: { role: string, filled: boolean, name: string | null }[] }[] }
    const seen = body.performances.find(one => one.performanceId === house.performanceId)
    const barRow = seen!.team.find(member => member.role === 'BAR')
    expect(barRow).toMatchObject({ filled: false, name: null })
  })

  test('a door shift holder is not the duty manager, and is refused', async () => {
    const door = await registerMember(app, 'door-only', generatePassword())
    const house = performance('door-only')
    shift(house.performanceId, 'DOOR', door.id)

    expect((await send('GET', '/api/tonight/duty-manager', undefined, door.cookie)).status).toBe(403)
  })

  test('an ordinary member with no shift is refused', async () => {
    const member = await registerMember(app, 'no-shift', generatePassword())
    expect((await send('GET', '/api/tonight/duty-manager', undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the phone consent (E-112 criterion 2)', () => {
  test('opting in shows the phone; the default is opted out', async () => {
    const dm = await registerMember(app, 'dm-consent', generatePassword())
    const holder = await registerMember(app, 'consenting-holder', generatePassword())
    const house = performance('consent')
    shift(house.performanceId, 'DUTY_MANAGER', dm.id)
    shift(house.performanceId, 'BAR', holder.id)

    const before = await (await send('GET', '/api/tonight/duty-manager', undefined, dm.cookie)).json() as
      { performances: { performanceId: string, team: { role: string, phone: string | null }[] }[] }
    const beforeRow = before.performances.find(one => one.performanceId === house.performanceId)!.team.find(m => m.role === 'BAR')
    expect(beforeRow?.phone).toBeNull()

    const { profile } = await (await send('GET', '/api/account/profile', undefined, holder.cookie)).json() as { profile: Record<string, unknown> }
    const saved = await send('PUT', '/api/account/profile', { ...profile, phone: '07700 900111', shiftContactVisible: true }, holder.cookie)
    expect(saved.status).toBe(200)

    const after = await (await send('GET', '/api/tonight/duty-manager', undefined, dm.cookie)).json() as
      { performances: { performanceId: string, team: { role: string, phone: string | null }[] }[] }
    const afterRow = after.performances.find(one => one.performanceId === house.performanceId)!.team.find(m => m.role === 'BAR')
    expect(afterRow?.phone).toBe('07700 900111')
  })
})

describe.skipIf(skip !== null)('what the screen shows about the show (E-112 criterion 1)', () => {
  test('the latecomer policy and any content warning ride along', async () => {
    const dm = await registerMember(app, 'dm-warnings', generatePassword())
    const house = performance('warnings')
    shift(house.performanceId, 'DUTY_MANAGER', dm.id)
    write('UPDATE shows SET latecomer_policy = ?, age_guidance = ? WHERE id = ?',
      'NOT_ADMITTED', 'Contains gunshot sound effects', house.showId)

    const warningId = read<{ id: string }>(`SELECT id FROM content_warnings LIMIT 1`)?.id
    if (warningId) {
      write('INSERT INTO show_content_warnings (id, show_id, warning_id, level) VALUES (?, ?, ?, ?)',
        `scw-${house.showId}`, house.showId, warningId, 'DEPICTED')
    }

    const body = await (await send('GET', '/api/tonight/duty-manager', undefined, dm.cookie)).json() as
      { performances: { performanceId: string, latecomerPolicy: string, ageGuidance: string, warnings: { title: string, level: string }[] }[] }
    const seen = body.performances.find(one => one.performanceId === house.performanceId)
    expect(seen).toMatchObject({ latecomerPolicy: 'NOT_ADMITTED', ageGuidance: 'Contains gunshot sound effects' })
    if (warningId) expect(seen!.warnings.length).toBeGreaterThan(0)
  })
})

describe.skipIf(skip !== null)('the contacts block every role reaches (E-112 criterion 2)', () => {
  test('a door shift holder reads tonight\'s team, and a consented number comes with it', async () => {
    const door = await registerMember(app, 'door-contacts', generatePassword())
    const dutyManager = await registerMember(app, 'dm-contacts', generatePassword())
    const house = performance('contacts')
    shift(house.performanceId, 'DOOR', door.id)
    shift(house.performanceId, 'DUTY_MANAGER', dutyManager.id)

    const answered = await send('GET', '/api/tonight/team', undefined, door.cookie)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { performances: { performanceId: string, team: { role: string, filled: boolean, name: string | null, phone: string | null }[] }[] }
    const seen = body.performances.find(one => one.performanceId === house.performanceId)
    const managerRow = seen!.team.find(member => member.role === 'DUTY_MANAGER')
    expect(managerRow).toMatchObject({ filled: true, name: dutyManager.name, phone: null })

    const { profile } = await (await send('GET', '/api/account/profile', undefined, dutyManager.cookie)).json() as { profile: Record<string, unknown> }
    await send('PUT', '/api/account/profile', { ...profile, phone: '07700 900222', shiftContactVisible: true }, dutyManager.cookie)

    const after = await (await send('GET', '/api/tonight/team', undefined, door.cookie)).json() as
      { performances: { performanceId: string, team: { role: string, phone: string | null }[] }[] }
    const afterRow = after.performances.find(one => one.performanceId === house.performanceId)!.team.find(member => member.role === 'DUTY_MANAGER')
    expect(afterRow?.phone).toBe('07700 900222')
  })

  test('a member with no shift tonight reaches nobody', async () => {
    const member = await registerMember(app, 'no-shift-contacts', generatePassword())
    expect((await send('GET', '/api/tonight/team', undefined, member.cookie)).status).toBe(403)
  })
})

// The worst moment of the night is not the moment to go looking for a number, so the card the
// door already has open carries the one it rings after 999 (E-113, issue 1150 item 14).
describe.skipIf(skip !== null)('the emergency card names who to ring after 999 (E-113)', () => {
  function card(venueId: string, id: string): void {
    write('INSERT INTO venue_emergency_info (id, venue_id, address, updated_by) VALUES (?, ?, ?, ?)',
      id, venueId, 'The Nottingham New Theatre, Nottingham NG7 2RD', admin.id)
  }

  function venueOf(performanceId: string): string {
    return read<{ venue_id: string }>('SELECT venue_id FROM performances WHERE id = ?', performanceId)!.venue_id
  }

  test('a consenting duty manager on tonight\'s rota is on the card the door opens', async () => {
    const door = await registerMember(app, 'door-emergency', generatePassword())
    const dutyManager = await registerMember(app, 'dm-emergency', generatePassword())
    const house = performance('emergency-card')
    shift(house.performanceId, 'DOOR', door.id)
    shift(house.performanceId, 'DUTY_MANAGER', dutyManager.id)
    card(venueOf(house.performanceId), 'vei-emergency-card')

    const { profile } = await (await send('GET', '/api/account/profile', undefined, dutyManager.cookie)).json() as { profile: Record<string, unknown> }
    await send('PUT', '/api/account/profile', { ...profile, phone: '07700 900333', shiftContactVisible: true }, dutyManager.cookie)

    const answered = await send('GET', '/api/tonight/emergency', undefined, door.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { dutyManagers: { name: string, phone: string }[] }
    expect(body.dutyManagers).toEqual([{ name: dutyManager.name, phone: '07700 900333' }])
  })

  test('a duty manager who has not shared a number leaves the card with none (A-114)', async () => {
    const door = await registerMember(app, 'door-emergency-quiet', generatePassword())
    const dutyManager = await registerMember(app, 'dm-emergency-quiet', generatePassword())
    const house = performance('emergency-quiet')
    shift(house.performanceId, 'DOOR', door.id)
    shift(house.performanceId, 'DUTY_MANAGER', dutyManager.id)
    card(venueOf(house.performanceId), 'vei-emergency-quiet')

    const body = await (await send('GET', '/api/tonight/emergency', undefined, door.cookie)).json() as
      { dutyManagers: { name: string, phone: string }[] }
    expect(body.dutyManagers).toEqual([])
  })
})
