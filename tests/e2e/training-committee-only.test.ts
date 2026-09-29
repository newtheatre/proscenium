import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, grantCommitteeRole, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-105 criterion 8 and decision 0114: a committee-only module stays listed for somebody off the
// committee, with its action disabled, and self sign-up and asking are refused at the write.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const WORDS = 'Only available to the committee'

let app: AppUnderTest
let admin: TestMember
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  department = `COM${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Committee training' })).status).toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
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

async function addModule(committeeOnly: boolean): Promise<string> {
  const id = `${department}-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id, department, kind: 'MODULE', name: `Module ${id}`, status: 'ACTIVE', committeeOnly,
  })
  expect(answered.status).toBe(200)
  return id
}

async function schedule(moduleIds: string[]): Promise<string> {
  const answered = await send('POST', '/api/admin/training/sessions', {
    heldOn: daysFrom(7), startsAt: '19:00', endsAt: '21:00', capacity: 4, moduleIds,
  })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const refusal = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

interface CatalogueItem { id: string, committeeOnly: boolean, action: { kind: string } | null }
interface SessionItem { id: string, committeeOnly: boolean }

const catalogueItem = async (moduleId: string, as: string): Promise<CatalogueItem | undefined> =>
  ((await (await send('GET', '/api/training/catalogue', undefined, as)).json()) as { items: CatalogueItem[] }).items
    .find(one => one.id === moduleId)

const sessionItem = async (sessionId: string, as: string): Promise<SessionItem | undefined> =>
  ((await (await send('GET', '/api/training/sessions', undefined, as)).json()) as { items: SessionItem[] }).items
    .find(one => one.id === sessionId)

describe.skipIf(skip !== null)('the module editor carries the flag (G-105 criterion 8)', () => {
  test('saved on create and changed on edit', async () => {
    const moduleId = await addModule(true)
    expect(read<{ committee_only: number }>('SELECT committee_only FROM modules WHERE id = ?', moduleId)?.committee_only).toBe(1)

    const edited = await send('PUT', `/api/admin/training/modules/${moduleId}`, {
      department, kind: 'MODULE', name: `Module ${moduleId}`, status: 'ACTIVE', committeeOnly: false,
    })
    expect(edited.status).toBe(200)
    expect(read<{ committee_only: number }>('SELECT committee_only FROM modules WHERE id = ?', moduleId)?.committee_only).toBe(0)
  })
})

describe.skipIf(skip !== null)('somebody without a committee role (G-105 criterion 8)', () => {
  test('still sees the module in the catalogue, marked, with its action disabled', async () => {
    const member = await registerMember(app, 'off-committee', generatePassword())
    const moduleId = await addModule(true)
    await schedule([moduleId])

    const seen = await catalogueItem(moduleId, member.cookie)
    expect(seen).toMatchObject({ committeeOnly: true, action: { kind: 'COMMITTEE_ONLY' } })
  })

  test('still sees the session, marked committee-only, and is refused its sign-up in the same words', async () => {
    const member = await registerMember(app, 'off-committee-signup', generatePassword())
    const moduleId = await addModule(true)
    const sessionId = await schedule([moduleId])

    expect(await sessionItem(sessionId, member.cookie)).toMatchObject({ committeeOnly: true })

    const answered = await send('POST', `/api/training/sessions/${sessionId}/signup`, {}, member.cookie)
    expect(answered.status).toBe(403)
    expect(await refusal(answered)).toContain(WORDS)
    expect(read('SELECT id FROM session_attendees WHERE session_id = ? AND user_id = ?', sessionId, member.id)).toBeUndefined()
  })

  test('is refused an ask for the module', async () => {
    const member = await registerMember(app, 'off-committee-ask', generatePassword())
    const moduleId = await addModule(true)

    const answered = await send('POST', '/api/training/requests', { moduleId }, member.cookie)
    expect(answered.status).toBe(403)
    expect(await refusal(answered)).toContain(WORDS)
  })

  // Only the IT Manager's role is not a committee role: it is a function held without a post (0112).
  test('holding the IT Manager\'s role alone does not count', async () => {
    const moduleId = await addModule(true)
    expect((await catalogueItem(moduleId, admin.cookie))?.action).toEqual({ kind: 'COMMITTEE_ONLY' })
  })

  test('an ordinary module is unaffected', async () => {
    const member = await registerMember(app, 'off-committee-ordinary', generatePassword())
    const moduleId = await addModule(false)
    const sessionId = await schedule([moduleId])

    expect(await catalogueItem(moduleId, member.cookie)).toMatchObject({ committeeOnly: false, action: { kind: 'SIGN_UP' } })
    expect((await send('POST', `/api/training/sessions/${sessionId}/signup`, {}, member.cookie)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('somebody holding a committee role (G-105 criterion 8)', () => {
  test('signs up and asks as for any module', async () => {
    const member = await registerMember(app, 'on-committee', generatePassword())
    grantCommitteeRole(app, member.id)
    const moduleId = await addModule(true)
    const sessionId = await schedule([moduleId])

    expect(await catalogueItem(moduleId, member.cookie)).toMatchObject({ committeeOnly: true, action: { kind: 'SIGN_UP' } })
    expect(await sessionItem(sessionId, member.cookie)).toMatchObject({ committeeOnly: false })
    expect((await send('POST', `/api/training/sessions/${sessionId}/signup`, {}, member.cookie)).status).toBe(200)

    const other = await addModule(true)
    expect((await send('POST', '/api/training/requests', { moduleId: other }, member.cookie)).status).toBe(200)
  })
})
