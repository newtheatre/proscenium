import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { letters, skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// H-104 against the real routes: five held changes become one email, and a sixth after the
// window closes is a second one (criterion 6).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let officer = ''
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = (await adminSession(app)).cookie
  member = await registerMember(app, 'digested', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, cookie?: string): Promise<Response> {
  return fetch(`${app.baseURL}${path}`, { method, headers: cookie ? { cookie } : {} })
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function readAll<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

// The state an unclaimed, topic-bearing send leaves when notify() holds it instead of sending
// (H-104 criteria 1, 3): a row here, none yet in notification_log.
function heldEntry(userId: string, subject: string, ageSeconds: number): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  write(
    `INSERT INTO notification_digest_entries (id, user_id, topic, type, subject, body, created_at)
     VALUES (?, ?, 'ROOMS', 'room.request.received', ?, 'A change worth reading about.', unixepoch() - ?)`,
    id, userId, subject, ageSeconds,
  )
  return id
}

const sweep = (): Promise<Response> => send('POST', '/api/dev/send-digests', officer)

describe.skipIf(skip !== null)('five changes coalesce into one email (criterion 1)', () => {
  test('one provider call, one send-log row, five entries', async () => {
    const subjects = Array.from({ length: 5 }, (_, index) => `Change ${index + 1} ${crypto.randomUUID().slice(0, 6)}`)
    const ids = subjects.map(subject => heldEntry(member.id, subject, 61 * 60))

    const answered = await sweep()
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ sent: 1 })

    interface LogRow { id: string, type: string, status: string }
    const logRow = read<LogRow>(
      `SELECT l.id, l.type, l.status FROM notification_log l JOIN users u ON u.id = l.user_id
       WHERE u.id = ? AND l.type = 'digest.rooms' ORDER BY l.rowid DESC LIMIT 1`,
      member.id,
    )
    expect(logRow).toMatchObject({ type: 'digest.rooms', status: 'SENT' })

    const claimed = readAll<{ id: string, digest_log_id: string | null }>(
      `SELECT id, digest_log_id FROM notification_digest_entries WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    )
    expect(claimed.every(row => row.digest_log_id === logRow!.id)).toBe(true)

    const letter = (await letters(app)).find(body => subjects.every(subject => body.includes(subject)))
    expect(letter).toBeDefined()
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the window resets after a flush (criterion 6)', () => {
  test('a sixth entry inside its own window is not swept up early, and aged past it, sends on its own', async () => {
    const sixth = await registerMember(app, 'sixth-entry', generatePassword())
    const countFor = (): number =>
      read<{ n: number }>(`SELECT count(*) n FROM notification_log WHERE type = 'digest.rooms' AND user_id = ?`, sixth.id)?.n ?? 0

    heldEntry(sixth.id, 'Not due yet', 5 * 60)
    await sweep()
    expect(countFor()).toBe(0)

    heldEntry(sixth.id, 'Now due', 61 * 60)
    await sweep()
    expect(countFor()).toBe(1)
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
