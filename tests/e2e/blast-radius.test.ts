import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { CONFIG_KEYS } from '#shared/utils/config'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride } from '#tests/helpers/config'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// J-105: the blast-radius preview, the typed confirmation it gates, and the one-action revert.
// The count itself is pinned in the integration suite; this proves the route wiring.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  const database = new Database(app.databaseFile)
  try {
    database.query(`INSERT INTO users (id, email, name, verified) VALUES ('officer-1', 'officer-1@e2e.newtheatre.org.uk', 'An officer (test)', 1)`).run()
    database.query(`INSERT INTO role_grants (id, user_id, role) VALUES ('officer-1-box-office', 'officer-1', 'FOH_MANAGER')`).run()
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

describe.skipIf(skip !== null)('the blast-radius preview (criterion 1)', () => {
  test('names the count and category for a flagged key', async () => {
    const answered = await send('GET', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER/blast-radius')
    expect(answered.status).toBe(200)
    const body = await answered.json() as { count: number, category: string }
    // Every desk role also holds money.refund (0102), so nobody is counted.
    expect(body.count).toBe(0)
    expect(body.category).toContain('box office officers')
  })

  test('404s for a key that carries no preview', async () => {
    const answered = await send('GET', '/api/admin/config/PASSWORD_MIN_LENGTH/blast-radius')
    expect(answered.status).toBe(404)
  })
})

describe.skipIf(skip !== null)('saving a flagged key needs a typed confirmation (criterion 2)', () => {
  test('is refused with no confirmation at all', async () => {
    const answered = await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', { value: false })
    expect(answered.status).toBe(400)
  })

  test('is refused with a confirmation that matches neither the count nor the key', async () => {
    const answered = await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', {
      value: false,
      confirmation: 'yes please',
    })
    expect(answered.status).toBe(400)
  })

  test('the key\'s own name is accepted', async () => {
    const answered = await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', {
      value: false,
      confirmation: 'REFUND_PAID_REQUIRES_MANAGER',
    })
    expect(answered.status).toBe(200)
  })

  test('the previewed count is accepted, and the value actually saves', async () => {
    const preview = await (await send('GET', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER/blast-radius')).json() as { count: number }
    const answered = await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', {
      value: true,
      confirmation: String(preview.count),
    })
    expect(answered.status).toBe(200)

    const settings = await (await send('GET', '/api/admin/config')).json() as { settings: { key: string, value: unknown }[] }
    expect(settings.settings.find(setting => setting.key === 'REFUND_PAID_REQUIRES_MANAGER')?.value).toBe(true)
  })

  test('an unflagged key needs no confirmation at all', async () => {
    const answered = await send('PUT', '/api/admin/config/HOLD_RELEASE_BATCH_CAP', { value: 150 })
    expect(answered.status).toBe(200)
  })
})

// Issue 1357: which keys are flagged is code, and the second-factor roles are one of them, with
// a floor no confirmation gets below (0009, A-112 criterion 4).
describe.skipIf(skip !== null)('the flag list and the second-factor roles', () => {
  const FLOOR = CONFIG_KEYS.PRIVILEGED_ROLES.default

  test('the flag list is not a setting', async () => {
    expect((await send('PUT', '/api/admin/config/WIDE_BLAST_RADIUS_KEYS', { value: [] })).status).toBe(404)
    const settings = await (await send('GET', '/api/admin/config')).json() as { settings: { key: string, wideBlastRadius: boolean }[] }
    expect(settings.settings.some(setting => setting.key === 'WIDE_BLAST_RADIUS_KEYS')).toBe(false)
    expect(settings.settings.find(setting => setting.key === 'PRIVILEGED_ROLES')?.wideBlastRadius).toBe(true)
  })

  test('the second-factor roles preview who an added role would refuse', async () => {
    const answered = await send('GET', '/api/admin/config/PRIVILEGED_ROLES/blast-radius')
    expect(answered.status).toBe(200)
    expect((await answered.json() as { category: string }).category).toContain('authenticator')
  })

  test('adding a role needs the typed confirmation, and then saves', async () => {
    try {
      expect((await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: [...FLOOR, 'COMMITTEE'] })).status).toBe(400)
      const answered = await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: [...FLOOR, 'COMMITTEE'], confirmation: 'PRIVILEGED_ROLES' })
      expect(answered.status).toBe(200)
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
    }
  })

  test('a role on the floor cannot be taken off, however it is confirmed', async () => {
    const answered = await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', {
      value: FLOOR.filter(role => role !== 'TREASURER'),
      confirmation: 'PRIVILEGED_ROLES',
    })
    expect(answered.status).toBe(400)
    expect((await answered.json() as { statusMessage: string }).statusMessage).toContain('Treasurer')
  })
})

describe.skipIf(skip !== null)('reverting (criterion 3)', () => {
  test('one action reads the prior value back and saves it, audited the same way a save is', async () => {
    await send('PUT', '/api/admin/config/HOLD_RELEASE_BATCH_CAP', { value: 111 })
    await send('PUT', '/api/admin/config/HOLD_RELEASE_BATCH_CAP', { value: 222 })

    const reverted = await send('POST', '/api/admin/config/HOLD_RELEASE_BATCH_CAP/revert')
    expect(reverted.status).toBe(200)
    expect((await reverted.json() as { value: number }).value).toBe(111)

    const settings = await (await send('GET', '/api/admin/config')).json() as { settings: { key: string, value: unknown }[] }
    expect(settings.settings.find(setting => setting.key === 'HOLD_RELEASE_BATCH_CAP')?.value).toBe(111)
  })

  test('a key with no change on the trail has nothing to revert to', async () => {
    const answered = await send('POST', '/api/admin/config/RESERVATION_RESEND_ATTEMPTS/revert')
    expect(answered.status).toBe(409)
  })

  // Criterion 6: a revert writes a value as a save does, so a flagged key asks the same of it.
  test('reverting a flagged key needs the same typed confirmation as saving it', async () => {
    const floor = CONFIG_KEYS.PRIVILEGED_ROLES.default
    try {
      await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: [...floor, 'COMMITTEE'], confirmation: 'PRIVILEGED_ROLES' })
      await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: [...floor], confirmation: 'PRIVILEGED_ROLES' })

      const unconfirmed = await send('POST', '/api/admin/config/PRIVILEGED_ROLES/revert')
      expect(unconfirmed.status).toBe(400)
      expect((await unconfirmed.json() as { statusMessage: string }).statusMessage).toContain('"PRIVILEGED_ROLES"')

      const reverted = await send('POST', '/api/admin/config/PRIVILEGED_ROLES/revert', { confirmation: 'PRIVILEGED_ROLES' })
      expect(reverted.status).toBe(200)
      expect((await reverted.json() as { value: string[] }).value).toContain('COMMITTEE')
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
    }
  })

  test('reverting needs config.write, the same as saving', async () => {
    const bystander = await registerMember(app, 'bystander', generatePassword())
    const answered = await send('POST', '/api/admin/config/HOLD_RELEASE_BATCH_CAP/revert', undefined, bystander.cookie)
    expect(answered.status).toBe(403)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
