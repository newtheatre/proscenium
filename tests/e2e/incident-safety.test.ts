import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-116's routes: the committee's routing config, the open-items list, closing a follow-up,
// and the wiring into E-115's incident routes that actually notifies the safety officer.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let safety: TestMember
let bar: TestMember
// The officer bypass needs a venue running something tonight (E-111).
let house: { venueId: string, performanceId: string }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  safety = await registerMember(app, 'safety-officer', generatePassword())
  bar = await registerMember(app, 'safety-bar', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: safety.id, role: 'SAFETY_OFFICER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'safety-house' })
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

interface SeverityRow { severity: string, requiresFollowUp: boolean }

describe.skipIf(skip !== null)('severity routing (E-116 criterion 1)', () => {
  test('all four severities are seeded, none routed', async () => {
    const listed = await send('GET', '/api/admin/safety/severities', undefined, safety.cookie)
    expect(listed.status).toBe(200)
    const { severities } = await listed.json() as { severities: SeverityRow[] }
    expect(severities).toHaveLength(4)
    expect(severities.every(row => row.requiresFollowUp === false)).toBe(true)
  })

  test('the safety officer can opt a severity in', async () => {
    const updated = await send('PUT', '/api/admin/safety/severities/SERIOUS', { requiresFollowUp: true }, safety.cookie)
    expect(updated.status).toBe(200)

    const listed = await send('GET', '/api/admin/safety/severities', undefined, safety.cookie)
    const { severities } = await listed.json() as { severities: SeverityRow[] }
    expect(severities.find(row => row.severity === 'SERIOUS')?.requiresFollowUp).toBe(true)
  })

  test('an unknown severity 404s', async () => {
    const answered = await send('PUT', '/api/admin/safety/severities/CATASTROPHIC', { requiresFollowUp: true }, safety.cookie)
    expect(answered.status).toBe(404)
  })

  test('an ordinary member cannot read or change the routing', async () => {
    const member = await registerMember(app, 'safety-nobody', generatePassword())
    expect((await send('GET', '/api/admin/safety/severities', undefined, member.cookie)).status).toBe(403)
    expect((await send('PUT', '/api/admin/safety/severities/NOTE', { requiresFollowUp: true }, member.cookie)).status).toBe(403)
  })

  test('changing the routing writes an audit entry', async () => {
    await send('PUT', '/api/admin/safety/severities/NEAR_MISS', { requiresFollowUp: true }, safety.cookie)
    const row = read<{ action: string, detail: string }>(
      `SELECT action, detail FROM audit_log WHERE target = ? AND action = 'incident-severity.routing-changed'`, 'severity:NEAR_MISS')
    expect(row?.action).toBe('incident-severity.routing-changed')
    expect(JSON.parse(row!.detail)).toMatchObject({ requiresFollowUp: true })
  })
})

describe.skipIf(skip !== null)('the open-items list and closing a follow-up (E-116 criteria 2, 3)', () => {
  test('a routed incident opens, a non-routed one does not, and closing it clears it', async () => {
    await send('PUT', '/api/admin/safety/severities/SERIOUS', { requiresFollowUp: true }, safety.cookie)
    await send('PUT', '/api/admin/safety/severities/NOTE', { requiresFollowUp: false }, safety.cookie)

    const routed = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'SERIOUS', body: 'A cracked step on the fire exit.' }, bar.cookie)
    const { id: routedId } = await routed.json() as { id: string }
    const unrouted = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'NOTE', body: 'Nothing to report.' }, bar.cookie)
    const { id: unroutedId } = await unrouted.json() as { id: string }

    const open = await send('GET', '/api/admin/safety/open-items', undefined, safety.cookie)
    expect(open.status).toBe(200)
    const { items } = await open.json() as { items: { id: string }[] }
    expect(items.map(item => item.id)).toContain(routedId)
    expect(items.map(item => item.id)).not.toContain(unroutedId)

    const closed = await send('POST', `/api/admin/safety/incidents/${routedId}/close`, { resolutionNote: 'Step repaired by facilities and re-checked.' }, safety.cookie)
    expect(closed.status).toBe(200)

    const afterClose = await send('GET', '/api/admin/safety/open-items', undefined, safety.cookie)
    const { items: afterItems } = await afterClose.json() as { items: { id: string }[] }
    expect(afterItems.map(item => item.id)).not.toContain(routedId)

    const row = read<{ action: string }>(
      `SELECT action FROM audit_log WHERE target = ? AND action = 'incident-followup.closed'`, `incident:${routedId}`)
    expect(row?.action).toBe('incident-followup.closed')
  })

  test('a second closure on the same incident 409s', async () => {
    const routed = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'SERIOUS', body: 'Another cracked step.' }, bar.cookie)
    const { id } = await routed.json() as { id: string }

    expect((await send('POST', `/api/admin/safety/incidents/${id}/close`, { resolutionNote: 'Fixed.' }, safety.cookie)).status).toBe(200)
    expect((await send('POST', `/api/admin/safety/incidents/${id}/close`, { resolutionNote: 'Fixed again.' }, safety.cookie)).status).toBe(409)
  })

  test('closing a missing incident 409s', async () => {
    expect((await send('POST', '/api/admin/safety/incidents/no-such-entry/close', { resolutionNote: 'Fixed.' }, safety.cookie)).status).toBe(409)
  })

  test('an empty resolution note is refused', async () => {
    const routed = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'SERIOUS', body: 'Yet another cracked step.' }, bar.cookie)
    const { id } = await routed.json() as { id: string }
    expect((await send('POST', `/api/admin/safety/incidents/${id}/close`, { resolutionNote: '' }, safety.cookie)).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('logging at a routed severity notifies the safety officer (E-116 criterion 2)', () => {
  test('logging an incident at a routed severity sends one, unrouted sends none', async () => {
    await send('PUT', '/api/admin/safety/severities/SERIOUS', { requiresFollowUp: true }, safety.cookie)
    await send('PUT', '/api/admin/safety/severities/NOTE', { requiresFollowUp: false }, safety.cookie)

    const before = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0

    await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'NOTE', body: 'A routine note.' }, bar.cookie)
    const afterUnrouted = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0
    expect(afterUnrouted).toBe(before)

    await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'SERIOUS', body: 'A serious matter needing follow-up.' }, bar.cookie)
    const row = read<{ status: string }>(
      `SELECT status FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required' ORDER BY created_at DESC LIMIT 1`, safety.id)
    expect(row?.status).toBe('SENT')
  })

  test('reporting a near miss at a routed severity notifies too', async () => {
    await send('PUT', '/api/admin/safety/severities/NEAR_MISS', { requiresFollowUp: true }, safety.cookie)

    const before = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0

    await send('POST', '/api/tonight/incidents/near-miss', { performanceId: house.performanceId, category: 'SAFETY', body: 'Nearly missed a step in the dark.' }, bar.cookie)

    const after = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0
    expect(after).toBe(before + 1)
  })

  test('a correction that moves severity into routed territory notifies on the new severity alone', async () => {
    await send('PUT', '/api/admin/safety/severities/SERIOUS', { requiresFollowUp: true }, safety.cookie)
    await send('PUT', '/api/admin/safety/severities/NOTE', { requiresFollowUp: false }, safety.cookie)

    const logged = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'NOTE', body: 'Looked minor at first.' }, bar.cookie)
    const { id } = await logged.json() as { id: string }

    const before = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0

    await send('POST', `/api/tonight/incidents/${id}/supersede`, { category: 'SAFETY', severity: 'SERIOUS', body: 'Turned out worse than it looked.' }, bar.cookie)

    const after = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'incident.follow-up-required'`, safety.id)?.n ?? 0
    expect(after).toBe(before + 1)
  })
})
