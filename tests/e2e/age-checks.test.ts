import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-118 through the real routes. Trigger enforcement and the supersede race are pinned in
// `tests/integration/age-checks.test.ts`; this is the guard, the wiring and the audit trail.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let bar: TestMember
let door: TestMember
// The officer bypass needs a venue running something tonight (E-111); every case here relies on
// this one house, since a second venue running at once would make the request ambiguous (E-127).
let house: { venueId: string, performanceId: string }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  bar = await registerMember(app, 'age-bar', generatePassword())
  door = await registerMember(app, 'age-door', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: 'age-checks-house' })
    house = { venueId: made.venueId, performanceId: made.performanceId }
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

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const accepted = { performanceId: null, outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null, description: 'Tall man, grey coat', product: 'Strongbow', notes: null }
const refused = { performanceId: null, outcome: 'REFUSED', idType: null, reason: 'NO_ID_SHOWN', description: 'Short woman, red jacket', product: 'Strongbow', notes: null }

describe.skipIf(skip !== null)('logging a Challenge 25 check (E-118 criteria 1, 2, 4)', () => {
  test('the bar manager can log an accepted check', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const row = read<{ outcome: string, id_type: string, reason: string | null, checked_by: string }>(
      'SELECT outcome, id_type, reason, checked_by FROM age_checks WHERE id = ?', id)
    expect(row).toMatchObject({ outcome: 'ACCEPTED', id_type: 'PASSPORT', reason: null, checked_by: bar.id })
  })

  test('the FOH officer (door authority) can log a refused check', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', refused, door.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const row = read<{ outcome: string, reason: string, id_type: string | null }>(
      'SELECT outcome, reason, id_type FROM age_checks WHERE id = ?', id)
    expect(row).toMatchObject({ outcome: 'REFUSED', reason: 'NO_ID_SHOWN', id_type: null })
  })

  test('an ordinary member cannot log a check', async () => {
    const member = await registerMember(app, 'age-nobody', generatePassword())
    expect((await send('POST', '/api/tonight/age-checks', accepted, member.cookie)).status).toBe(403)
  })

  test('an accepted check with no ID type is refused before it is written', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', { ...accepted, idType: null }, bar.cookie)
    expect(answered.status).toBe(400)
  })

  test('a refusal with no reason is refused before it is written', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', { ...refused, reason: null }, bar.cookie)
    expect(answered.status).toBe(400)
  })

  test('logging a check writes an audit entry naming the outcome', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    const { id } = await answered.json() as { id: string }

    const entry = read<{ action: string, detail: string }>(
      `SELECT action, detail FROM audit_log WHERE target = ?`, `age-check:${id}`)
    expect(entry?.action).toBe('age-check.logged')
    expect(JSON.parse(entry!.detail)).toMatchObject({ outcome: 'ACCEPTED' })
  })

  test('a check may name tonight\'s performance', async () => {
    const answered = await send('POST', '/api/tonight/age-checks', { ...accepted, performanceId: house.performanceId }, bar.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }
    expect(read<{ performance_id: string }>('SELECT performance_id FROM age_checks WHERE id = ?', id)?.performance_id).toBe(house.performanceId)
  })
})

describe.skipIf(skip !== null)('tonight\'s register (E-118 criterion 4)', () => {
  test('a logged check appears in the list', async () => {
    const logged = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    const { id } = await logged.json() as { id: string }

    const listed = await send('GET', '/api/tonight/age-checks?pageSize=100', undefined, bar.cookie)
    expect(listed.status).toBe(200)
    const { items } = await listed.json() as { items: { id: string, outcome: string }[] }
    expect(items.map(item => item.id)).toContain(id)
  })

  test('an ordinary member cannot read the register', async () => {
    const member = await registerMember(app, 'age-reader', generatePassword())
    expect((await send('GET', '/api/tonight/age-checks', undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('correcting an entry (E-118 criterion 3, 0049)', () => {
  test('a correction supersedes without editing the original', async () => {
    const logged = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    const { id } = await logged.json() as { id: string }

    const corrected = await send('POST', `/api/tonight/age-checks/${id}/supersede`, refused, bar.cookie)
    expect(corrected.status).toBe(200)
    const { id: correctionId } = await corrected.json() as { id: string }

    expect(read<{ outcome: string }>('SELECT outcome FROM age_checks WHERE id = ?', id)?.outcome).toBe('ACCEPTED')
    expect(read<{ supersedes_id: string }>('SELECT supersedes_id FROM age_checks WHERE id = ?', correctionId)?.supersedes_id).toBe(id)
  })

  test('a second correction on the same entry is refused', async () => {
    const logged = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    const { id } = await logged.json() as { id: string }
    expect((await send('POST', `/api/tonight/age-checks/${id}/supersede`, refused, bar.cookie)).status).toBe(200)

    const second = await send('POST', `/api/tonight/age-checks/${id}/supersede`, accepted, bar.cookie)
    expect(second.status).toBe(409)
  })

  test('correcting a missing entry 404s', async () => {
    expect((await send('POST', '/api/tonight/age-checks/no-such-entry/supersede', refused, bar.cookie)).status).toBe(404)
  })

  test('a correction writes its own audit entry', async () => {
    const logged = await send('POST', '/api/tonight/age-checks', accepted, bar.cookie)
    const { id } = await logged.json() as { id: string }
    await send('POST', `/api/tonight/age-checks/${id}/supersede`, refused, bar.cookie)

    const entry = read<{ action: string }>(
      `SELECT action FROM audit_log WHERE target = ? AND action = 'age-check.superseded'`, `age-check:${id}`)
    expect(entry?.action).toBe('age-check.superseded')
  })
})
