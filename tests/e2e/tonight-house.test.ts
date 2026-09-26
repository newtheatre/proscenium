import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1307 through the real route: the door and the bar read tonight's house and show
// information, and only the door and the duty manager read the access wording (D-127 criterion 3).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let door: TestMember
let bar: TestMember
let nobody: TestMember
let performanceId: string

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  door = await registerMember(app, 'house-door', generatePassword())
  bar = await registerMember(app, 'house-bar', generatePassword())
  nobody = await registerMember(app, 'house-nobody', generatePassword())

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    ticketTypeFixture(target)
    const venueId = testVenue(target, { suffix: 'tonight-house' }).id
    performanceId = tonightsPerformance(target, { suffix: 'tonight-house', venueId }).performanceId
  }
  finally {
    database.close()
  }
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)', 'house-door-shift', performanceId, 'DOOR', door.id, 'CONFIRMED')
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)', 'house-bar-shift', performanceId, 'BAR', bar.id, 'CONFIRMED')
  write('INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)', 'r-house-in', 'HOUSE1', performanceId, 'DOOR', 'WEB')
  write('INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)', 't-house-in', 'r-house-in', performanceId, 'tt-standard', 900, 'BASE')
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
    access: unknown[] | null
  }[]
}

describe.skipIf(skip !== null)('tonight\'s house for every shift (issue 1307)', () => {
  test('a door shift reads the numbers, the show information and the access wording', async () => {
    const answered = await request(app, 'GET', '/api/tonight/house', undefined, door.cookie)
    expect(answered.status).toBe(200)
    const { performances } = await answered.json() as House
    const tonight = performances.find(one => one.performanceId === performanceId)!
    expect(tonight.house).toMatchObject({ sold: 1, admitted: 1 })
    expect(tonight).toHaveProperty('latecomerPolicy')
    expect(tonight).toHaveProperty('intervalCount')
    expect(tonight.access).toEqual([])
  }, CASE_TIMEOUT_MS)

  test('a bar shift reads the same numbers, and never the access wording', async () => {
    const answered = await request(app, 'GET', '/api/tonight/house', undefined, bar.cookie)
    expect(answered.status).toBe(200)
    const { performances } = await answered.json() as House
    const tonight = performances.find(one => one.performanceId === performanceId)!
    expect(tonight.house).toMatchObject({ sold: 1, admitted: 1 })
    expect(tonight.access).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a member with no shift tonight reads nothing', async () => {
    expect((await request(app, 'GET', '/api/tonight/house', undefined, nobody.cookie)).status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
