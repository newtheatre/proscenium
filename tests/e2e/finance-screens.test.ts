import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// /money/periods and /money/exports (I-107, I-108): the routes were already tested, but no
// screen reached them. This pins what each screen's own flow does: preview before close, a
// typed confirmation before reopen, and editing a mapping before the CSV reads it.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let treasurer: TestMember
let boxOffice: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  treasurer = await registerMember(app, 'screens-treasurer', generatePassword())
  boxOffice = await registerMember(app, 'screens-box-office', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: treasurer.id, role: 'TREASURER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body: unknown, as: string): Promise<Response> =>
  request(app, method, path, body, as)

function zReading(night: string, variancePence: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`screens-z-${night}`, night, 1000 + variancePence, 1000, variancePence, treasurer.id)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('/money/periods: the preview shown before closing (I-107 criterion 5)', () => {
  test('a clear range previews with nothing blocking, and the treasurer closes it', async () => {
    const fromDay = '2019-01-01'
    const toDay = '2019-01-31'

    const preview = await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, treasurer.cookie)
    expect(preview.status).toBe(200)
    const body = await preview.json() as { unreconciledNights: string[], openVarianceNights: string[] }
    expect(body.unreconciledNights).toEqual([])
    expect(body.openVarianceNights).toEqual([])

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay, label: 'January 2019' }, treasurer.cookie)
    expect(closed.status).toBe(200)
  })

  test('an open variance inside the range is named in the preview, and closing still succeeds around it', async () => {
    const fromDay = '2019-02-01'
    const toDay = '2019-02-28'
    zReading('2019-02-15', 50)

    const preview = await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, treasurer.cookie)
    const body = await preview.json() as { openVarianceNights: string[] }
    expect(body.openVarianceNights).toContain('2019-02-15')

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, treasurer.cookie)
    expect(closed.status).toBe(200)
  })

  test('box office holds neither finance.read nor finance.write: refused at preview and close', async () => {
    const fromDay = '2019-03-01'
    const toDay = '2019-03-31'
    expect((await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, boxOffice.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, boxOffice.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('/money/periods: reopening with the range typed back (I-107 criterion 4)', () => {
  test('the treasurer closes, box office cannot reopen, and an administrator reopens with the matching range', async () => {
    const fromDay = '2019-04-01'
    const toDay = '2019-04-30'
    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, treasurer.cookie)
    const { id: lockId } = await closed.json() as { id: string }

    expect((await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: fromDay, confirmToDay: toDay }, boxOffice.cookie)).status).toBe(403)

    const reopened = await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: fromDay, confirmToDay: toDay }, admin.cookie)
    expect(reopened.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('/money/exports: editing a mapping before the CSV reads it (I-108 criteria 1, 2, 3)', () => {
  test('the treasurer edits the mapping and the export carries it, with a proper header row', async () => {
    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES ('screens-e1', unixepoch(), '2019-05-10', 'DESK', 'CARD', ?, 900)
      `).run(treasurer.id)
      database.query(`
        INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES ('screens-l1', 'screens-e1', 'WALK_UP', 900)
      `).run()
    }
    finally {
      database.close()
    }

    const edited = await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4150' }, treasurer.cookie)
    expect(edited.status).toBe(200)

    const exported = await send('GET', '/api/admin/finance/export?fromDay=2019-05-01&toDay=2019-05-31', undefined, treasurer.cookie)
    expect(exported.status).toBe(200)
    const csv = await exported.text()
    const [header, ...rows] = csv.trim().split('\r\n')
    expect(header).toBe('"date","category","nominalCode","amountPence","amountPounds"')
    expect(rows.some(row => row.includes('"4150"'))).toBe(true)
  })

  test('box office holds neither finance.write nor finance.export: refused editing and downloading', async () => {
    expect((await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '9999' }, boxOffice.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/finance/export?fromDay=2019-05-01&toDay=2019-05-31', undefined, boxOffice.cookie)).status).toBe(403)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
