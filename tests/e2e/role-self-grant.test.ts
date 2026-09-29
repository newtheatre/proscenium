import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SELF_GRANT } from '#shared/utils/roles'
import { adminSession, query, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-118 criterion 7 (0113): nobody grants themselves a role but the IT Manager's own, which adds
// nothing its holder lacks. Another IT Manager grants it, and is the actor on the trail.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('nobody grants themselves a role (A-118 criterion 7, 0113)', () => {
  test('an IT Manager granting themselves the Committee is refused, and nothing is written', async () => {
    const itm = await adminSession(app)
    const response = await request(app, 'POST', '/api/admin/roles', { userId: itm.id, role: 'COMMITTEE' }, itm.cookie)
    expect(response.status).toBe(403)
    expect((await response.json()).statusMessage ?? '').toBe(SELF_GRANT)
    expect(query<{ n: number }>(app, `SELECT count(*) AS n FROM role_grants WHERE user_id = ? AND role = 'COMMITTEE'`, itm.id)).toEqual({ n: 0 })
  }, 60_000)

  test('a post role is refused to oneself too', async () => {
    const itm = await adminSession(app)
    const response = await request(app, 'POST', '/api/admin/roles', { userId: itm.id, role: 'TREASURER' }, itm.cookie)
    expect(response.status).toBe(403)
  }, 60_000)

  test('another IT Manager makes the same grant, and is its actor', async () => {
    const itm = await adminSession(app)
    const other = await adminSession(app)
    const response = await request(app, 'POST', '/api/admin/roles', { userId: itm.id, role: 'COMMITTEE' }, other.cookie)
    expect(response.status).toBe(200)
    expect(query<{ grantedBy: string }>(app, `SELECT granted_by AS grantedBy FROM role_grants WHERE user_id = ? AND role = 'COMMITTEE'`, itm.id))
      .toEqual({ grantedBy: other.id })
  }, 60_000)

  test('renewing one\'s own IT Manager grant still works, since it adds nothing', async () => {
    const itm = await adminSession(app)
    const response = await request(app, 'POST', '/api/admin/roles', { userId: itm.id, role: 'ADMIN', expiresAt: null }, itm.cookie)
    expect(response.status).toBe(200)
  }, 60_000)

  test('granting somebody else is unaffected', async () => {
    const itm = await adminSession(app)
    const member = await registerMember(app, 'member', generatePassword())
    const response = await request(app, 'POST', '/api/admin/roles', { userId: member.id, role: 'COMMITTEE' }, itm.cookie)
    expect(response.status).toBe(200)
  }, 60_000)
})
