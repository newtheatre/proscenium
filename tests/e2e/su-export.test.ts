import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// I-108's routes end to end: who may configure a mapping and who may export, the CSV shape and
// its formula-injection guard, and that both writes land in the audit trail.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let treasurer: TestMember
let front: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  treasurer = await registerMember(app, 'export-treasurer', generatePassword())
  front = await registerMember(app, 'export-front', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: treasurer.id, role: 'TREASURER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: front.id, role: 'FRONT_OF_HOUSE' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    database.query(`
      INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
      VALUES (?, unixepoch(), ?, 'DESK', 'CARD', ?, 900)
    `).run('su-export-e1', '2026-09-15', treasurer.id)
    database.query(`
      INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES (?, ?, 'WALK_UP', 900)
    `).run('su-export-l1', 'su-export-e1')
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

describe.skipIf(skip !== null)('who may configure a mapping (finance.write) and who may export (finance.export)', () => {
  test('the treasurer can read and change a mapping, and export', async () => {
    expect((await send('GET', '/api/admin/finance/nominal-mappings', undefined, treasurer.cookie)).status).toBe(200)
    expect((await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4100' }, treasurer.cookie)).status).toBe(200)
    expect((await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)).status).toBe(200)
  })

  test('front of house holds none of finance\'s permissions', async () => {
    expect((await send('GET', '/api/admin/finance/nominal-mappings', undefined, front.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '9999' }, front.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, front.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('changing a mapping is audited with the from and to values (J-104 criterion 5)', () => {
  test('records who changed it and what it was before', async () => {
    await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4100' }, treasurer.cookie)
    await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4200' }, treasurer.cookie)

    const row = read<{ actor_id: string, detail: string }>(
      `SELECT actor_id, detail FROM audit_log WHERE action = 'finance.nominal-mapping.changed' ORDER BY created_at DESC LIMIT 1`)
    expect(row?.actor_id).toBe(treasurer.id)
    expect(JSON.parse(row!.detail)).toMatchObject({ changes: { nominalCode: { from: '4100', to: '4200' } } })
  })

  test('a pair no ledger line ever posts under is refused', async () => {
    const answered = await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'BAR_ITEM', source: 'DESK', nominalCode: '4100' }, treasurer.cookie)
    expect(answered.status).toBe(400)
  })
})

describe.skipIf(skip !== null)('the CSV export (criteria 2, 3)', () => {
  test('is a CSV attachment naming the range, carrying the mapped code and both pence and pounds', async () => {
    await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4100' }, treasurer.cookie)

    const answered = await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    expect(answered.headers.get('content-disposition')).toContain('su-export-2026-09-01-to-2026-09-30.csv')

    const body = await answered.text()
    const header = body.trim().split('\r\n')[0]
    expect(header).toBe('"date","category","tender","nominalCode","amountPence","amountPounds"')
    expect(body).toContain('"2026-09-15","Walk-up sale","Card","4100","900","9.00"')
    // Issue #1363: the file closes on the card total, the figure the money dashboard calls revenue.
    expect(body.trim().split('\r\n').at(-1)).toMatch(/^"","Card total, the same as the money dashboard's revenue","Card","","-?\d+","-?\d+\.\d{2}"$/)
  })

  test('a line whose pair has no mapping exports on its own explicit unmapped line', async () => {
    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES (?, unixepoch(), ?, 'TILL', 'CARD', ?, 500)
      `).run('su-export-e2', '2026-09-16', treasurer.id)
      database.query(`
        INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES (?, ?, 'BAR_ITEM', 500)
      `).run('su-export-l2', 'su-export-e2')
    }
    finally {
      database.close()
    }

    const answered = await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)
    const body = await answered.text()
    expect(body).toContain('"2026-09-16","Bar item","Card","UNMAPPED","500","5.00"')
  })

  test('a nominal code shaped like a formula is guarded, not left to execute when the file opens', async () => {
    await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '=1+1' }, treasurer.cookie)

    const answered = await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)
    const body = await answered.text()
    expect(body).not.toContain('"=1+1"')
    expect(body).toContain('"\'=1+1"')
  })
})

describe.skipIf(skip !== null)('the yearly return by name: a year or a season (criterion 4, 0087)', () => {
  // A year no other suite touches, so closing it cannot refuse another suite's own ledger writes.
  const YEAR = 2012

  beforeAll(() => {
    if (skip) return
    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES (?, unixepoch(), ?, 'DESK', 'CARD', ?, 700)
      `).run('su-export-year-e1', '2011-10-10', treasurer.id)
      database.query(`
        INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES (?, ?, 'WALK_UP', 700)
      `).run('su-export-year-l1', 'su-export-year-e1')
      database.query(`
        INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)
      `).run('su-export-autumn', 'Autumn 2011', '2011-09-20', '2011-12-10')
    }
    finally {
      database.close()
    }
  })

  test('a year exports 1 August to 31 July, named in the file and marked open until it is closed', async () => {
    const answered = await send('GET', `/api/admin/finance/export?kind=YEAR&year=${YEAR}`, undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-disposition')).toContain('su-export-2011-08-01-to-2012-07-31.csv')
    expect(answered.headers.get('x-period-status')).toBe('open')
    expect(await answered.text()).toContain('"2011-10-10","Walk-up sale"')
  })

  test('a season exports its own row\'s days', async () => {
    const answered = await send('GET', '/api/admin/finance/export?kind=SEASON&seasonId=su-export-autumn', undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-disposition')).toContain('su-export-2011-09-20-to-2011-12-10.csv')
  })

  test('an unknown season is not found, and the whole year asked for as a season is refused', async () => {
    expect((await send('GET', '/api/admin/finance/export?kind=SEASON&seasonId=no-such-season', undefined, treasurer.cookie)).status).toBe(404)
    expect((await send('GET', `/api/admin/finance/export?kind=SEASON&year=${YEAR}`, undefined, treasurer.cookie)).status).toBe(400)
  })

  test('the status says what a download would cover without taking one, for the exporter only', async () => {
    const answered = await send('GET', `/api/admin/finance/export/coverage?kind=YEAR&year=${YEAR}`, undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ fromDay: '2011-08-01', toDay: '2012-07-31', rows: 1, closed: false })
    expect((await send('GET', `/api/admin/finance/export/coverage?kind=YEAR&year=${YEAR}`, undefined, front.cookie)).status).toBe(403)
  })

  test('once the year is closed, two runs are byte-identical and both say closed', async () => {
    const closed = await send('POST', '/api/admin/finance/periods', { fromDay: '2011-08-01', toDay: '2012-07-31', label: '2011/12' }, treasurer.cookie)
    expect(closed.status).toBe(200)

    const first = await send('GET', `/api/admin/finance/export?kind=YEAR&year=${YEAR}`, undefined, treasurer.cookie)
    const second = await send('GET', `/api/admin/finance/export?kind=YEAR&year=${YEAR}`, undefined, treasurer.cookie)
    expect(first.headers.get('x-period-status')).toBe('closed')
    expect(second.headers.get('x-period-status')).toBe('closed')
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array(await first.arrayBuffer()))

    const status = await send('GET', `/api/admin/finance/export/coverage?kind=YEAR&year=${YEAR}`, undefined, treasurer.cookie)
    expect(await status.json()).toMatchObject({ closed: true })
  })
})

describe.skipIf(skip !== null)('exporting is audited (criterion 5)', () => {
  test('records who exported and which range', async () => {
    await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)

    const row = read<{ actor_id: string, detail: string }>(
      `SELECT actor_id, detail FROM audit_log WHERE action = 'finance.exported' ORDER BY created_at DESC LIMIT 1`)
    expect(row?.actor_id).toBe(treasurer.id)
    expect(JSON.parse(row!.detail)).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-30' })
  })
})
