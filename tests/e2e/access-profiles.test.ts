import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-127 through the real routes: a self-declared profile, verified only by a named accessibility
// officer, encrypted at rest, and gone on withdrawal or erasure.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let accessOfficer: TestMember
let boxOffice: TestMember
let patron: TestMember
const patronPassword = generatePassword()

// The officer account carries no authenticator; narrowing PRIVILEGED_ROLES for one request is
// the same shortcut `tests/e2e/pass-types.test.ts` uses to reach a route without an A-112 dance.
async function withoutSecondFactor<T>(fn: () => Promise<T>): Promise<T> {
  await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN'] })
  try {
    return await fn()
  }
  finally {
    await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER'] })
  }
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  accessOfficer = await registerMember(app, 'access', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: accessOfficer.id, role: 'ACCESSIBILITY_OFFICER' }, admin.cookie)

  boxOffice = await registerMember(app, 'boxoffice', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)

  patron = await registerMember(app, 'patron', patronPassword)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { cookie: as } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function row<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const BLANK_FLAGS = {
  standing: false, crowds: false, levelAccess: false, distance: false, urgentToilet: false,
  essentialCompanion: false, visualInformation: false, audibleInformation: false, other: false,
}

function declaration(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    flags: { ...BLANK_FLAGS, levelAccess: true },
    companions: 1,
    requesterNote: 'Uses a wheelchair',
    accessCardNumber: 'NAC0001234',
    consent: true,
    ...over,
  }
}

describe.skipIf(skip !== null)('a patron declares their own profile (criterion 1)', () => {
  test('flags, companions and a note are accepted and read back', async () => {
    expect((await send('PUT', '/api/account/access-profile', declaration(), patron.cookie)).status).toBe(200)

    const answered = await send('GET', '/api/account/access-profile', undefined, patron.cookie)
    const { profile } = await answered.json() as { profile: { status: string, flags: Record<string, boolean>, companions: number } }
    expect(profile.status).toBe('PENDING')
    expect(profile.flags.levelAccess).toBe(true)
    expect(profile.companions).toBe(1)
  })

  test('more than two companions is refused', async () => {
    expect((await send('PUT', '/api/account/access-profile', declaration({ companions: 3 }), patron.cookie)).status).toBe(400)
  })

  test('the stored payload is not the plaintext note: encrypted at rest (criterion 4, 0050)', async () => {
    const stored = row<{ encrypted_payload: string }>(
      'SELECT encrypted_payload FROM access_profiles WHERE user_id = ?', patron.id,
    )
    expect(stored?.encrypted_payload).toBeDefined()
    expect(stored!.encrypted_payload).not.toContain('wheelchair')
  })
})

describe.skipIf(skip !== null)('only a named accessibility officer verifies (criterion 2)', () => {
  test('general box office cannot reach the review screen', async () => {
    expect((await send('GET', '/api/admin/access-profiles', undefined, boxOffice.cookie)).status).toBe(403)
    expect((await send('POST', `/api/admin/access-profiles/${patron.id}/verify`, { fohNote: 'Aisle seat' }, boxOffice.cookie)).status).toBe(403)
  })

  test('an ordinary member cannot reach it either', async () => {
    expect((await send('GET', '/api/admin/access-profiles', undefined, patron.cookie)).status).toBe(403)
  })

  test('the accessibility officer reads the full declaration', async () => {
    const answered = await withoutSecondFactor(() => send('GET', `/api/admin/access-profiles/${patron.id}`, undefined, accessOfficer.cookie))
    expect(answered.status).toBe(200)
    const { profile } = await answered.json() as { profile: { flags: Record<string, boolean>, requesterNote: string | null, accessCardNumber: string | null } }
    expect(profile.flags.levelAccess).toBe(true)
    expect(profile.requesterNote).toBe('Uses a wheelchair')
    expect(profile.accessCardNumber).toBe('NAC0001234')
  })

  test('verifying sets the agreed wording and clears the evidence reference', async () => {
    const verified = await withoutSecondFactor(() =>
      send('POST', `/api/admin/access-profiles/${patron.id}/verify`, { fohNote: 'Aisle seat, own wheelchair' }, accessOfficer.cookie))
    expect(verified.status).toBe(200)

    const answered = await send('GET', '/api/account/access-profile', undefined, patron.cookie)
    const { profile } = await answered.json() as { profile: { status: string, fohNote: string | null, accessCardNumber: string | null, verifiedAt: number | null } }
    expect(profile.status).toBe('VERIFIED')
    expect(profile.fohNote).toBe('Aisle seat, own wheelchair')
    expect(profile.accessCardNumber).toBeNull()
    expect(profile.verifiedAt).not.toBeNull()
  })
})

describe.skipIf(skip !== null)('what the door may ever see (criterion 3)', () => {
  test('never the need flags, the diagnosis or the requester\'s own words: only the agreed wording is on the row', async () => {
    const stored = row<{ status: string, encrypted_payload: string }>(
      'SELECT status, encrypted_payload FROM access_profiles WHERE user_id = ?', patron.id,
    )
    expect(stored?.status).toBe('VERIFIED')
    // The payload is ciphertext, so this proves nothing legible sits beside it in the clear;
    // `doorWording()` is what a door screen calls, pinned directly in tests/unit/access-profiles.test.ts.
    expect(stored!.encrypted_payload).not.toContain('wheelchair')
  })
})

describe.skipIf(skip !== null)('withdrawal and reinstatement (criterion 5)', () => {
  test('withdrawing tombstones the profile rather than deleting it outright', async () => {
    expect((await send('POST', '/api/account/access-profile/withdraw', {}, patron.cookie)).status).toBe(200)

    const stored = row<{ status: string, withdrawn_at: number | null }>(
      'SELECT status, withdrawn_at FROM access_profiles WHERE user_id = ?', patron.id,
    )
    expect(stored?.status).toBe('WITHDRAWN')
    expect(stored?.withdrawn_at).not.toBeNull()
  })

  test('withdrawing twice is idempotent, not an error', async () => {
    const answered = await send('POST', '/api/account/access-profile/withdraw', {}, patron.cookie)
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ withdrawn: false, alreadyWithdrawn: true })
  })

  test('a withdrawn profile cannot be verified: only the owner reinstates it', async () => {
    const attempt = await withoutSecondFactor(() =>
      send('POST', `/api/admin/access-profiles/${patron.id}/verify`, { fohNote: 'Should not apply' }, accessOfficer.cookie))
    expect(attempt.status).toBe(409)
  })

  test('the owner declaring again is the one sanctioned way back in', async () => {
    expect((await send('PUT', '/api/account/access-profile', declaration({ companions: 0 }), patron.cookie)).status).toBe(200)
    const answered = await send('GET', '/api/account/access-profile', undefined, patron.cookie)
    const { profile } = await answered.json() as { profile: { status: string } }
    expect(profile.status).toBe('PENDING')
  })
})

describe.skipIf(skip !== null)('GDPR erasure deletes the profile immediately, not after a tombstone (criterion 5)', () => {
  test('closing the account removes the row outright', async () => {
    const password = generatePassword()
    const gone = await registerMember(app, 'erasable', password)

    expect((await send('PUT', '/api/account/access-profile', declaration(), gone.cookie)).status).toBe(200)
    expect(row('SELECT user_id FROM access_profiles WHERE user_id = ?', gone.id)).toBeDefined()

    expect((await send('POST', '/api/account/close', { email: gone.email, password }, gone.cookie)).status).toBe(200)
    expect(row('SELECT user_id FROM access_profiles WHERE user_id = ?', gone.id)).toBeUndefined()
  })
})

describe.skipIf(skip !== null)('the screens', () => {
  test('the patron declares access requirements from their own account page', async () => {
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', patron.email)
    await fill(view, 'form input[type="password"]', patronPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/access`, '[data-test="access-form"]')
    const text = await textOf(view, '[data-test="access-form"]')
    expect(text).toContain('What do you need?')
    view.close()
  }, 120_000)
})
