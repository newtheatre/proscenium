import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-115 and E-117 through the real routes. Trigger enforcement and the supersede race are pinned
// in `tests/integration/incidents.test.ts`; this is the guard, the wiring and the audit trail.

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
  bar = await registerMember(app, 'incident-bar', generatePassword())
  door = await registerMember(app, 'incident-door', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'incidents-house' })
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

const entry = { performanceId: null as string | null, category: 'SAFETY', severity: 'INCIDENT', body: 'A trip hazard on the stairs was flagged and taped off.' }

describe.skipIf(skip !== null)('logging an incident (E-115 criteria 1, 2, 4)', () => {
  test('the bar manager can log an incident', async () => {
    const answered = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const row = read<{ category: string, severity: string, reported_by: string }>(
      'SELECT category, severity, reported_by FROM incidents WHERE id = ?', id)
    expect(row).toMatchObject({ category: 'SAFETY', severity: 'INCIDENT', reported_by: bar.id })
  })

  test('the FOH officer (door authority) can log an incident', async () => {
    const answered = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId, category: 'BEHAVIOUR' }, door.cookie)
    expect(answered.status).toBe(200)
  })

  test('an ordinary member cannot log an incident', async () => {
    const member = await registerMember(app, 'incident-nobody', generatePassword())
    expect((await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, member.cookie)).status).toBe(403)
  })

  test('an empty body is refused before it is written', async () => {
    const answered = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId, body: '' }, bar.cookie)
    expect(answered.status).toBe(400)
  })

  test('a time outside tonight is refused', async () => {
    const answered = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId, happenedAt: 1 }, bar.cookie)
    expect(answered.status).toBe(400)
  })

  test('logging an incident writes an audit entry naming the category and severity', async () => {
    const answered = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    const { id } = await answered.json() as { id: string }

    const row = read<{ action: string, detail: string }>(
      `SELECT action, detail FROM audit_log WHERE target = ? AND action = 'incident.logged'`, `incident:${id}`)
    expect(row?.action).toBe('incident.logged')
    expect(JSON.parse(row!.detail)).toMatchObject({ category: 'SAFETY', severity: 'INCIDENT' })
  })
})

describe.skipIf(skip !== null)('reporting a near miss (E-117 criteria 1, 2, 3)', () => {
  test('a category and a sentence is enough, and it lands as a NEAR_MISS severity', async () => {
    const answered = await send('POST', '/api/tonight/incidents/near-miss', { performanceId: house.performanceId, category: 'SAFETY', body: 'Nearly missed a step in the dark.' }, bar.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const row = read<{ severity: string, category: string }>('SELECT severity, category FROM incidents WHERE id = ?', id)
    expect(row).toMatchObject({ severity: 'NEAR_MISS', category: 'SAFETY' })
  })

  test('a near miss carries no severity from the caller: sending one is ignored, not honoured', async () => {
    const answered = await send('POST', '/api/tonight/incidents/near-miss',
      { performanceId: house.performanceId, category: 'SAFETY', body: 'Nearly missed a step.', severity: 'SERIOUS' }, bar.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }
    expect(read<{ severity: string }>('SELECT severity FROM incidents WHERE id = ?', id)?.severity).toBe('NEAR_MISS')
  })

  test('an ordinary member cannot report a near miss', async () => {
    const member = await registerMember(app, 'nearmiss-nobody', generatePassword())
    expect((await send('POST', '/api/tonight/incidents/near-miss', { performanceId: house.performanceId, category: 'SAFETY', body: 'Body' }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('tonight\'s log (E-115 criterion 4)', () => {
  test('a logged entry appears in the list', async () => {
    const logged = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    const { id } = await logged.json() as { id: string }

    const listed = await send('GET', '/api/tonight/incidents?pageSize=100', undefined, bar.cookie)
    expect(listed.status).toBe(200)
    const { items } = await listed.json() as { items: { id: string, category: string }[] }
    expect(items.map(item => item.id)).toContain(id)
  })

  test('an ordinary member cannot read the log', async () => {
    const member = await registerMember(app, 'incident-reader', generatePassword())
    expect((await send('GET', '/api/tonight/incidents', undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('correcting an entry (E-115 criterion 3, 0049)', () => {
  test('a correction supersedes without editing the original', async () => {
    const logged = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    const { id } = await logged.json() as { id: string }

    const corrected = await send('POST', `/api/tonight/incidents/${id}/supersede`, { category: 'SAFETY', severity: 'SERIOUS', body: 'Corrected account of what happened.' }, bar.cookie)
    expect(corrected.status).toBe(200)
    const { id: correctionId } = await corrected.json() as { id: string }

    expect(read<{ severity: string }>('SELECT severity FROM incidents WHERE id = ?', id)?.severity).toBe('INCIDENT')
    expect(read<{ supersedes_id: string }>('SELECT supersedes_id FROM incidents WHERE id = ?', correctionId)?.supersedes_id).toBe(id)
  })

  test('a second correction on the same entry is refused', async () => {
    const logged = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    const { id } = await logged.json() as { id: string }
    expect((await send('POST', `/api/tonight/incidents/${id}/supersede`, { category: 'SAFETY', severity: 'SERIOUS', body: 'Corrected.' }, bar.cookie)).status).toBe(200)

    const second = await send('POST', `/api/tonight/incidents/${id}/supersede`, { category: 'SAFETY', severity: 'NOTE', body: 'Second correction.' }, bar.cookie)
    expect(second.status).toBe(409)
  })

  test('correcting a missing entry 404s', async () => {
    expect((await send('POST', '/api/tonight/incidents/no-such-entry/supersede', { category: 'SAFETY', severity: 'NOTE', body: 'Body' }, bar.cookie)).status).toBe(404)
  })

  test('a correction writes its own audit entry', async () => {
    const logged = await send('POST', '/api/tonight/incidents', { ...entry, performanceId: house.performanceId }, bar.cookie)
    const { id } = await logged.json() as { id: string }
    await send('POST', `/api/tonight/incidents/${id}/supersede`, { category: 'SAFETY', severity: 'SERIOUS', body: 'Corrected.' }, bar.cookie)

    const row = read<{ action: string }>(
      `SELECT action FROM audit_log WHERE target = ? AND action = 'incident.superseded'`, `incident:${id}`)
    expect(row?.action).toBe('incident.superseded')
  })
})
