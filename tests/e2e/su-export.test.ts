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
    expect(header).toBe('"date","category","nominalCode","amountPence","amountPounds"')
    expect(body).toContain('"2026-09-15","Walk-up sale","4100","900","9.00"')
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
    expect(body).toContain('"2026-09-16","Bar item","UNMAPPED","500","5.00"')
  })

  test('a nominal code shaped like a formula is guarded, not left to execute when the file opens', async () => {
    await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '=1+1' }, treasurer.cookie)

    const answered = await send('GET', '/api/admin/finance/export?fromDay=2026-09-01&toDay=2026-09-30', undefined, treasurer.cookie)
    const body = await answered.text()
    expect(body).not.toContain('"=1+1"')
    expect(body).toContain('"\'=1+1"')
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
