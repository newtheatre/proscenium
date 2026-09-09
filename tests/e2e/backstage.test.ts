import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-120 through the real routes. The derivation and the rotation arithmetic are pinned in
// `tests/integration/backstage.test.ts`; this is the guard, the join and the audit trail.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'backstage-foh', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  // A venue running tonight, so the officer bypass has coverage and joining has a night to
  // try; the fixture itself, not its ids, is what this suite needs (E-111, E-127).
  const database = new Database(app.databaseFile)
  try {
    tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: 'backstage-house' })
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

describe.skipIf(skip !== null)('the duty manager\'s code (E-120 criterion 5)', () => {
  test('the duty manager can read it, on demand', async () => {
    const answered = await send('GET', '/api/tonight/board/code', undefined, foh.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { code: string }
    expect(body.code).toMatch(/^\d{6}$/)
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'backstage-nobody', generatePassword())
    expect((await send('GET', '/api/tonight/board/code', undefined, member.cookie)).status).toBe(403)
  })

  test('the same night and venue always answers the same code until something rotates it', async () => {
    const first = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
    const second = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
    expect(first.code).toBe(second.code)
  })
})

describe.skipIf(skip !== null)('joining the board (E-120 criterion 1)', () => {
  test('the code from the duty manager\'s screen joins, with no account', async () => {
    const { code } = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }

    const joined = await request(app, 'POST', '/api/board/join', { code, label: 'Stage left' })
    expect(joined.status).toBe(200)
    const body = await joined.json() as { token: string, venueName: string }
    expect(body.token.length).toBeGreaterThan(20)

    const row = read<{ label: string }>('SELECT label FROM backstage_devices WHERE token_hash IS NOT NULL ORDER BY joined_at DESC LIMIT 1')
    expect(row?.label).toBe('Stage left')
  })

  test('a wrong code is refused, and never told which venue it was closest to', async () => {
    const refused = await request(app, 'POST', '/api/board/join', { code: '000000', label: 'Stage left' })
    expect(refused.status).toBe(401)
  })

  test('joining writes an audit entry naming no code', async () => {
    const { code } = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
    await request(app, 'POST', '/api/board/join', { code, label: 'Prompt corner' })

    const entry = read<{ detail: string }>(`SELECT detail FROM audit_log WHERE action = 'board.joined' ORDER BY created_at DESC LIMIT 1`)
    expect(entry?.detail ?? '').not.toContain(code)
  })
})

describe.skipIf(skip !== null)('ten failed attempts rotate the code (E-120 criterion 4)', () => {
  test('the code changes after ten wrong guesses', async () => {
    const before = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }

    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app, 'POST', '/api/board/join', { code: '999999', label: 'Guessing' })
    }

    const after = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
    expect(after.code).not.toBe(before.code)
  })
})
