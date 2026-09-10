import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-129's route: the permission gate, the CSV, the formula-injection guard end to end, and the
// audit trail. The filters and the row cap's SQL boundary are pinned in the integration suite.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let boxOffice: TestMember
let front: TestMember
let performanceId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  boxOffice = await registerMember(app, 'export-box-office', generatePassword())
  front = await registerMember(app, 'export-front', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: front.id, role: 'FRONT_OF_HOUSE' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    ticketTypeFixture(target)
    const seeded = tonightsPerformance(target, { suffix: 'export' })
    performanceId = seeded.performanceId

    // Formula-shaped, for the CSV test below: proves the route goes through `toCsv`, whatever
    // column a future addition might one day carry customer-typed text through.
    database.query(`UPDATE shows SET title = ? WHERE id = ?`).run('=1+1', seeded.showId)

    database.query(`
      INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, 'COLLECTED', 'WEB')
    `).run('export-r-1', 'EXPORT1', performanceId)
    database.query(`
      INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
      VALUES (?, ?, ?, ?, ?, 'BASE')
    `).run('export-t-1', 'export-r-1', performanceId, 'tt-standard', 900)
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

describe.skipIf(skip !== null)('who may export tickets (D-129 criterion 3, ticketing.export)', () => {
  test('box office can export', async () => {
    const answered = await send('GET', '/api/admin/tickets/export', undefined, boxOffice.cookie)
    expect(answered.status).toBe(200)
  })

  test('front of house cannot: this is a box office duty, not a general staff one', async () => {
    const answered = await send('GET', '/api/admin/tickets/export', undefined, front.cookie)
    expect(answered.status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the CSV export (criteria 2, 3)', () => {
  test('is a CSV attachment carrying the allow-listed columns and nothing else', async () => {
    const answered = await send('GET', '/api/admin/tickets/export', undefined, boxOffice.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    expect(answered.headers.get('content-disposition')).toContain('ticket-export.csv')

    const body = await answered.text()
    const header = body.trim().split('\r\n')[0]
    expect(header).toBe('"reference","performance","type","price","source","collected","refunded"')
    expect(body).toContain('EXPORT1')
    expect(body).toContain('£9.00')
  })

  test('a show title shaped like a formula is guarded, not left to execute when the file opens', async () => {
    const answered = await send('GET', '/api/admin/tickets/export', undefined, boxOffice.cookie)
    const body = await answered.text()
    // csvField prefixes a leading =, +, - or @ with an apostrophe, so a spreadsheet reads the
    // whole cell as text: the raw formula string must never appear unguarded.
    expect(body).not.toContain('"=1+1,')
    expect(body).toContain('\'=1+1,')
  })
})

describe.skipIf(skip !== null)('exporting is audited (criterion 4)', () => {
  test('records who exported, the filter and the row count', async () => {
    await send('GET', `/api/admin/tickets/export?performanceId=${performanceId}`, undefined, boxOffice.cookie)

    const row = read<{ action: string, actor_id: string, detail: string }>(
      `SELECT action, actor_id, detail FROM audit_log WHERE action = 'tickets.exported' ORDER BY created_at DESC LIMIT 1`)
    expect(row?.action).toBe('tickets.exported')
    expect(row?.actor_id).toBe(boxOffice.id)
    expect(JSON.parse(row!.detail)).toMatchObject({ performanceId, rows: 1 })
  })
})

describe.skipIf(skip !== null)('a bad filter combination is refused before any query runs', () => {
  test('a season and an explicit range together are refused', async () => {
    const answered = await send('GET', '/api/admin/tickets/export?season=2027&from=2026-08-01&to=2027-07-31', undefined, boxOffice.cookie)
    expect(answered.status).toBe(400)
  })

  test('a from with no to is refused', async () => {
    const answered = await send('GET', '/api/admin/tickets/export?from=2026-08-01', undefined, boxOffice.cookie)
    expect(answered.status).toBe(400)
  })
})
