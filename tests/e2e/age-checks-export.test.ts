import { PDFDocument } from 'pdf-lib'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-119's route: the permission gate, the audit trail, and the CSV and PDF an inspector can
// open without explanation. The date-range query is pinned in the integration suite.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let bar: TestMember
let foh: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  bar = await registerMember(app, 'export-bar', generatePassword())
  foh = await registerMember(app, 'export-foh', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    tonightsPerformance(sqliteTarget(database), { suffix: 'export-house' })
  }
  finally {
    database.close()
  }

  const accepted = await request(app, 'POST', '/api/tonight/age-checks', {
    performanceId: null, outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null,
    description: 'Tall man, grey coat', product: 'Strongbow', notes: null,
  }, bar.cookie)
  if (accepted.status !== 200) throw new Error(`fixture accepted check failed: ${accepted.status} ${await accepted.text()}`)

  const refused = await request(app, 'POST', '/api/tonight/age-checks', {
    performanceId: null, outcome: 'REFUSED', idType: null, reason: 'NO_ID_SHOWN',
    description: 'Short woman, red jacket', product: 'Strongbow', notes: null,
  }, bar.cookie)
  if (refused.status !== 200) throw new Error(`fixture refused check failed: ${refused.status} ${await refused.text()}`)
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

// Wide enough to cover whatever moment the fixture rows above were written at.
const RANGE = 'from=2020-01-01&to=2030-01-01'

describe.skipIf(skip !== null)('who may export the register (E-119 criterion 3)', () => {
  test('the front of house officer can export', async () => {
    const answered = await send('GET', `/api/admin/age-checks/export?${RANGE}&format=csv`, undefined, foh.cookie)
    expect(answered.status).toBe(200)
  })

  test('the bar manager cannot: the export is a front of house licensing duty', async () => {
    const answered = await send('GET', `/api/admin/age-checks/export?${RANGE}&format=csv`, undefined, bar.cookie)
    expect(answered.status).toBe(403)
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'export-nobody', generatePassword())
    expect((await send('GET', `/api/admin/age-checks/export?${RANGE}&format=csv`, undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the CSV register (E-119 criteria 1, 2)', () => {
  test('is a CSV attachment naming the range, with both outcomes present', async () => {
    const answered = await send('GET', `/api/admin/age-checks/export?${RANGE}&format=csv`, undefined, foh.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    expect(answered.headers.get('content-disposition')).toContain('challenge-25-register-2020-01-01-to-2030-01-01.csv')

    const body = await answered.text()
    const lines = body.trim().split('\r\n')
    expect(lines[0]).toContain('outcome')
    expect(body).toContain('ID accepted')
    expect(body).toContain('Refused')
  })

  test('a narrow range with nothing in it still answers 200', async () => {
    const answered = await send('GET', '/api/admin/age-checks/export?from=1999-01-01&to=1999-01-02&format=csv', undefined, foh.cookie)
    expect(answered.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('the PDF register (E-119 criteria 1, 2)', () => {
  test('is a well-formed, loadable PDF naming venue, period and generation date', async () => {
    const answered = await send('GET', `/api/admin/age-checks/export?${RANGE}&format=pdf`, undefined, foh.cookie)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toBe('application/pdf')
    expect(answered.headers.get('content-disposition')).toContain('challenge-25-register-2020-01-01-to-2030-01-01.pdf')

    const bytes = new Uint8Array(await answered.arrayBuffer())
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1)
  })
})

describe.skipIf(skip !== null)('exporting is audited (E-119 criterion 3)', () => {
  test('records who exported, the range, the format and the row count', async () => {
    await send('GET', `/api/admin/age-checks/export?${RANGE}&format=csv`, undefined, foh.cookie)

    const row = read<{ action: string, actor_id: string, detail: string }>(
      `SELECT action, actor_id, detail FROM audit_log WHERE action = 'age-checks.exported' ORDER BY created_at DESC LIMIT 1`)
    expect(row?.action).toBe('age-checks.exported')
    expect(row?.actor_id).toBe(foh.id)
    expect(JSON.parse(row!.detail)).toMatchObject({ from: '2020-01-01', to: '2030-01-01', format: 'csv' })
  })
})
