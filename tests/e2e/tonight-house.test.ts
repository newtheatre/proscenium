import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride, overrideConfig } from '#tests/helpers/config'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1307 through the real routes: every shift reads the house; access wording goes to the door
// and duty manager when asked (D-127 3), and on the verdict for tonight's own booking (D-128 4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
const WORDING = 'Aisle seat, assistance dog'

let app: AppUnderTest
let admin: TestMember
let door: TestMember
let bar: TestMember
let nobody: TestMember
let patron: TestMember
let performanceId: string
let otherPerformanceId: string

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

// The officer carries no authenticator. PRIVILEGED_ROLES is narrowed in the database for one
// request, since the settings route refuses a list below its floor (A-112, issue 1357).
async function withoutSecondFactor<T>(fn: () => Promise<T>): Promise<T> {
  overrideConfig(app, 'PRIVILEGED_ROLES', ['ADMIN'])
  try {
    return await fn()
  }
  finally {
    clearConfigOverride(app, 'PRIVILEGED_ROLES')
  }
}

const BLANK_FLAGS = {
  standing: false, crowds: false, levelAccess: false, distance: false, urgentToilet: false,
  essentialCompanion: false, visualInformation: false, audibleInformation: false, other: false,
}

async function verifiedPatron(): Promise<TestMember> {
  const officer = await registerMember(app, 'house-secretary', generatePassword())
  await grantRole(app, officer, 'SECRETARY', admin.cookie)
  const holder = await registerMember(app, 'house-patron', generatePassword())
  expect((await send('PUT', '/api/account/access-profile', {
    flags: { ...BLANK_FLAGS, levelAccess: true },
    companions: 1,
    requesterNote: 'Uses a wheelchair',
    accessCardNumber: null,
    consent: true,
    version: null,
  }, holder.cookie)).status).toBe(200)

  const read = await withoutSecondFactor(() => send('GET', `/api/admin/access-profiles/${holder.id}`, undefined, officer.cookie))
  const { version } = (await read.json() as { profile: { version: string | null } }).profile
  const verified = await withoutSecondFactor(() =>
    send('POST', `/api/admin/access-profiles/${holder.id}/verify`, { fohNote: WORDING, version }, officer.cookie))
  expect(verified.status).toBe(200)
  return holder
}

function booking(id: string, reference: string, performance: string, userId: string | null, ticketTypeId: string): void {
  write('INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)', id, reference, performance, userId, 'COLLECTED', 'WEB')
  write('INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)', `t-${id}`, id, performance, ticketTypeId, 900, 'BASE')
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  door = await registerMember(app, 'house-door', generatePassword())
  bar = await registerMember(app, 'house-bar', generatePassword())
  nobody = await registerMember(app, 'house-nobody', generatePassword())
  patron = await verifiedPatron()

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    ticketTypeFixture(target)
    // The door's own house at the default curtain, so its shift is in its window whenever this runs.
    const venueId = testVenue(target, { suffix: 'tonight-house' }).id
    performanceId = tonightsPerformance(target, { suffix: 'tonight-house', venueId }).performanceId
    otherPerformanceId = tonightsPerformance(target, { suffix: 'tonight-house-elsewhere', curtainHoursAfterNightStart: 10 }).performanceId
  }
  finally {
    database.close()
  }
  write('INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-house-access', 'House access', 900, 'SINGLE', 'ACCESS')
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)', 'house-door-shift', performanceId, 'DOOR', door.id, 'CONFIRMED')
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)', 'house-bar-shift', performanceId, 'BAR', bar.id, 'CONFIRMED')
  booking('r-house-access', 'HSACC1', performanceId, patron.id, 'tt-house-access')
  booking('r-house-plain', 'HSPLN1', performanceId, null, 'tt-standard')
  booking('r-house-matinee', 'HSMAT1', otherPerformanceId, patron.id, 'tt-house-access')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

interface House {
  performances: {
    performanceId: string
    house: { sold: number, admitted: number }
    latecomerPolicy: string | null
    intervalCount: number
    access: { firstName: string, wording: string }[] | null
  }[]
}

async function house(as: TestMember, query = ''): Promise<House['performances'][number]> {
  const answered = await request(app, 'GET', `/api/tonight/house${query}`, undefined, as.cookie)
  expect(answered.status).toBe(200)
  return (await answered.json() as House).performances.find(one => one.performanceId === performanceId)!
}

describe.skipIf(skip !== null)('tonight\'s house for every shift (issue 1307)', () => {
  test('a door shift reads the numbers and the show information, and the access wording when it asks', async () => {
    const plain = await house(door)
    expect(plain.house.sold).toBeGreaterThanOrEqual(2)
    expect(plain).toHaveProperty('latecomerPolicy')
    expect(plain).toHaveProperty('intervalCount')
    expect(plain.access).toBeNull()

    const asked = await house(door, '?access=1')
    expect(asked.access?.map(one => one.wording)).toEqual([WORDING])
  }, CASE_TIMEOUT_MS)

  test('a bar shift reads the same numbers, and never the access wording, even when it asks', async () => {
    const asked = await house(bar, '?access=1')
    expect(asked.house.sold).toBeGreaterThanOrEqual(2)
    expect(asked.access).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a member with no shift tonight reads nothing', async () => {
    expect((await request(app, 'GET', '/api/tonight/house', undefined, nobody.cookie)).status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the door\'s verdict carries the agreed wording (D-128 criterion 4)', () => {
  const scan = (reference: string): Promise<Response> =>
    request(app, 'POST', '/api/tonight/door/tickets/scan', { reference, performanceId }, door.cookie)

  test('tonight\'s access booking admits with the wording', async () => {
    const answered = await scan('HSACC1')
    expect(answered.status).toBe(200)
    expect((await answered.json() as { accessWording: string | null }).accessWording).toBe(WORDING)
  }, CASE_TIMEOUT_MS)

  test('an ordinary booking carries none', async () => {
    const answered = await scan('HSPLN1')
    expect(answered.status).toBe(200)
    expect((await answered.json() as { accessWording: string | null }).accessWording).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('another performance\'s access booking is refused, and its wording stays with it', async () => {
    const answered = await scan('HSMAT1')
    expect(answered.status).toBe(409)
    expect((await answered.json() as { data: { accessWording: string | null } }).data.accessWording).toBeNull()
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
