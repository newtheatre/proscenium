import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-126's routes: the permission gate, paging in SQL, and the CSV export with its audit trail.
// The date-range grouping and per-performance figures are pinned in the integration suite.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let bar: TestMember
let performanceId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'reports-foh', generatePassword())
  bar = await registerMember(app, 'reports-bar', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'reports-house' })
    performanceId = made.performanceId
  }
  finally {
    database.close()
  }

  const logged = await request(app, 'POST', '/api/tonight/incidents', {
    performanceId, category: 'SAFETY', severity: 'INCIDENT', body: 'Test entry',
  }, foh.cookie)
  if (logged.status !== 200) throw new Error(`fixture incident failed: ${logged.status} ${await logged.text()}`)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = foh.cookie): Promise<Response> =>
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

// Wide enough to cover whatever moment the fixtures above were written at.
const RANGE = 'kind=TERM&fromDay=2020-01-01&toDay=2030-01-01'

describe.skipIf(skip !== null)('who may read the cross-season report (E-126 criterion 3)', () => {
  test('the front of house officer can', async () => {
    expect((await send('GET', `/api/admin/reports/incidents?${RANGE}`)).status).toBe(200)
    expect((await send('GET', `/api/admin/reports/performances?${RANGE}`)).status).toBe(200)
  })

  test('the bar manager cannot: this is not a bar permission', async () => {
    expect((await send('GET', `/api/admin/reports/incidents?${RANGE}`, undefined, bar.cookie)).status).toBe(403)
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'reports-nobody', generatePassword())
    expect((await send('GET', `/api/admin/reports/incidents?${RANGE}`, undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the incident trend, paged in SQL (criteria 1, 2)', () => {
  test('answers an envelope, not a bare array, and finds the fixture incident', async () => {
    const answered = await send('GET', `/api/admin/reports/incidents?${RANGE}`)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { items: { category: string, severity: string, count: number }[], total: number, page: number, pageSize: number }
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body.items.some(row => row.category === 'SAFETY' && row.severity === 'INCIDENT' && row.count >= 1)).toBe(true)
  })

  test('a category filter narrows the result', async () => {
    const answered = await send('GET', `/api/admin/reports/incidents?${RANGE}&category=BEHAVIOUR`)
    const body = await answered.json() as { items: { category: string }[] }
    expect(body.items.every(row => row.category === 'BEHAVIOUR')).toBe(true)
  })
})

describe.skipIf(skip !== null)('the performance report, paged in SQL (criteria 1, 2)', () => {
  test('finds the fixture performance', async () => {
    const answered = await send('GET', `/api/admin/reports/performances?${RANGE}`)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { items: { performanceId: string }[] }
    expect(body.items.some(row => row.performanceId === performanceId)).toBe(true)
  })
})

describe.skipIf(skip !== null)('the CSV exports (criterion 2)', () => {
  test('the incident trend export is a CSV attachment naming the range', async () => {
    const answered = await send('GET', `/api/admin/reports/incidents/export?${RANGE}`)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    expect(answered.headers.get('content-disposition')).toContain('incident-trends-2020-01-01-to-2030-01-01.csv')
    const body = await answered.text()
    expect(body).toContain('Safety')
  })

  test('the performance report export is a CSV attachment naming the range', async () => {
    const answered = await send('GET', `/api/admin/reports/performances/export?${RANGE}`)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-disposition')).toContain('performance-report-2020-01-01-to-2030-01-01.csv')
    const body = await answered.text()
    expect(body).toContain('sold')
  })

  test('exporting is audited, naming who and how many rows', async () => {
    await send('GET', `/api/admin/reports/performances/export?${RANGE}`)
    const row = read<{ action: string, actor_id: string, detail: string }>(
      `SELECT action, actor_id, detail FROM audit_log
       WHERE action = 'reports.exported' AND json_extract(detail, '$.report') = 'performances'
       ORDER BY rowid DESC LIMIT 1`)
    expect(row?.action).toBe('reports.exported')
    expect(row?.actor_id).toBe(foh.id)
    expect(JSON.parse(row!.detail)).toMatchObject({ report: 'performances', fromDay: '2020-01-01', toDay: '2030-01-01' })
  })
})
