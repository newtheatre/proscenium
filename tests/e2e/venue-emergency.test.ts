import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-113 through the real routes. The append-only guard and the versioning are pinned in
// `tests/integration/venue-emergency.test.ts`; this is the wiring and the tonight-facing read.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let house: { venueId: string }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'emergency-foh', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: 'emergency-house' })
    house = { venueId: made.venueId }
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

describe.skipIf(skip !== null)('committee configuration (E-113 criterion 1)', () => {
  test('an officer can file a version and read it back', async () => {
    const saved = await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, {
      assemblyPoint: 'The car park behind the building',
      exits: 'Two, both stage left',
    })
    expect(saved.status).toBe(200)

    const listed = await send('GET', '/api/admin/venues/emergency')
    const { venues } = await listed.json() as { venues: { venueId: string, assemblyPoint: string | null }[] }
    expect(venues.find(venue => venue.venueId === house.venueId)?.assemblyPoint).toBe('The car park behind the building')
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'emergency-nobody', generatePassword())
    expect((await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { assemblyPoint: 'x' }, member.cookie)).status).toBe(403)
  })

  test('a second version supersedes without editing the first', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { assemblyPoint: 'First version' })
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { assemblyPoint: 'Second version' })

    const listed = await send('GET', '/api/admin/venues/emergency')
    const { venues } = await listed.json() as { venues: { venueId: string, assemblyPoint: string | null }[] }
    expect(venues.find(venue => venue.venueId === house.venueId)?.assemblyPoint).toBe('Second version')
  })

  test('editing a missing venue 404s', async () => {
    expect((await send('PUT', '/api/admin/venues/no-such-venue/emergency', { assemblyPoint: 'x' })).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('reading tonight\'s card (E-113 criteria 2, 4)', () => {
  test('a shift authority reads the current card for their own venue', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { assemblyPoint: 'Reading test' })

    const answered = await send('GET', '/api/tonight/emergency', undefined, foh.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { assemblyPoint: string | null, venueName: string }
    expect(body.assemblyPoint).toBe('Reading test')
    expect(body.venueName.length).toBeGreaterThan(0)
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'emergency-reader', generatePassword())
    expect((await send('GET', '/api/tonight/emergency', undefined, member.cookie)).status).toBe(403)
  })
})
