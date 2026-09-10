import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// J-109: the docs are reachable signed in with no standing permission, and reporting drift
// reaches the IT Manager. The collection and its frontmatter schema are Nuxt Content's own job.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  member = await registerMember(app, 'docs-member', generatePassword())
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

describe.skipIf(skip !== null)('operator documentation is reachable with no standing permission (criterion 1)', () => {
  test('the index page answers for a plain signed-in member', async () => {
    expect((await send('GET', '/docs', undefined, member.cookie)).status).toBe(200)
  })

  test('a module page answers the same way', async () => {
    expect((await send('GET', '/docs/box-office', undefined, member.cookie)).status).toBe(200)
  })

  test('a page with no matching file 404s rather than rendering something blank', async () => {
    expect((await send('GET', '/docs/no-such-module', undefined, member.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('reporting drift (criterion 4)', () => {
  test('is refused signed out', async () => {
    const answered = await request(app, 'POST', '/api/docs/report-drift', { path: '/docs/box-office' }, undefined)
    expect(answered.status).toBe(401)
  })

  test('audits the report and notifies every live IT Manager', async () => {
    const answered = await send('POST', '/api/docs/report-drift', { path: '/docs/box-office' }, member.cookie)
    expect(answered.status).toBe(200)

    const audited = read<{ action: string, actor_id: string, detail: string }>(
      `SELECT action, actor_id, detail FROM audit_log WHERE action = 'docs.drift-reported' ORDER BY created_at DESC LIMIT 1`)
    expect(audited?.action).toBe('docs.drift-reported')
    expect(audited?.actor_id).toBe(member.id)
    expect(JSON.parse(audited!.detail)).toMatchObject({ path: '/docs/box-office' })

    const notified = read<{ user_id: string, type: string }>(
      `SELECT user_id, type FROM notification_log WHERE type = 'docs.drift-reported' AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
      admin.id)
    expect(notified?.user_id).toBe(admin.id)
  })

  test('an empty path is refused before anything is written', async () => {
    expect((await send('POST', '/api/docs/report-drift', { path: '' }, member.cookie)).status).toBe(400)
  })
})
