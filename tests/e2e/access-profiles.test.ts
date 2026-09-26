import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { ACCESS_FLAG_LABELS, ACCESS_FLAGS } from '#shared/utils/access-profiles'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { race } from '#tests/helpers/race'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { OwnAccessProfile } from '#shared/utils/access-profiles'

// D-127 through the real routes: a self-declared profile, verified only by a named accessibility
// officer, encrypted at rest, and gone on withdrawal or erasure. The suite runs in file order.

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
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'FOH_MANAGER' }, admin.cookie)

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

// The officer decides on the declaration they read, so a decision sends back the version it saw
// (issue 1383, 0003).
async function versionOf(userId: string): Promise<string | null> {
  const answered = await withoutSecondFactor(() => send('GET', `/api/admin/access-profiles/${userId}`, undefined, accessOfficer.cookie))
  return (await answered.json() as { profile: { version: string | null } }).profile.version
}

async function decide(userId: string, decision: 'verify' | 'decline', body: Record<string, unknown>): Promise<Response> {
  const version = await versionOf(userId)
  return withoutSecondFactor(() => send('POST', `/api/admin/access-profiles/${userId}/${decision}`, { ...body, version }, accessOfficer.cookie))
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
    const verified = await decide(patron.id, 'verify', { fohNote: 'Aisle seat, own wheelchair' })
    expect(verified.status).toBe(200)

    const answered = await send('GET', '/api/account/access-profile', undefined, patron.cookie)
    const { profile } = await answered.json() as { profile: { status: string, fohNote: string | null, accessCardNumber: string | null, verifiedAt: number | null } }
    expect(profile.status).toBe('VERIFIED')
    expect(profile.fohNote).toBe('Aisle seat, own wheelchair')
    expect(profile.accessCardNumber).toBeNull()
    expect(profile.verifiedAt).not.toBeNull()
  })
})

async function own(member: TestMember = patron): Promise<OwnAccessProfile> {
  const answered = await send('GET', '/api/account/access-profile', undefined, member.cookie)
  return (await answered.json() as { profile: OwnAccessProfile }).profile
}

function count(sql: string, ...parameters: unknown[]): number {
  return row<{ n: number }>(sql, ...parameters)?.n ?? 0
}

// The declaration above as it stands once verified: sighting the card cleared its number.
const AS_VERIFIED = { accessCardNumber: null }

describe.skipIf(skip !== null)('a save re-pends only on a real change (criterion 7, issue 1334)', () => {
  test('saving the declaration unchanged keeps it verified, with its wording and its expiry', async () => {
    const before = await own()
    expect(before.status).toBe('VERIFIED')

    const saved = await send('PUT', '/api/account/access-profile', declaration(AS_VERIFIED), patron.cookie)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ repended: false })

    const after = await own()
    expect(after.status).toBe('VERIFIED')
    expect(after.fohNote).toBe('Aisle seat, own wheelchair')
    expect(after.expiresAt).toBe(before.expiresAt)
  })

  test('consent is its own switch: off and on again, the profile stays verified and the door follows it', async () => {
    expect((await send('PUT', '/api/account/access-profile/consent', { consent: false }, patron.cookie)).status).toBe(200)
    expect(await own()).toMatchObject({ status: 'VERIFIED', consentGiven: false, fohNote: 'Aisle seat, own wheelchair' })
    expect(row<{ consent_foh_at: number | null }>('SELECT consent_foh_at FROM access_profiles WHERE user_id = ?', patron.id)?.consent_foh_at).toBeNull()

    expect((await send('PUT', '/api/account/access-profile/consent', { consent: true }, patron.cookie)).status).toBe(200)
    expect(await own()).toMatchObject({ status: 'VERIFIED', consentGiven: true })
  })

  test('a consent change riding an unchanged save does not re-pend either', async () => {
    expect((await send('PUT', '/api/account/access-profile', declaration({ ...AS_VERIFIED, consent: false }), patron.cookie)).status).toBe(200)
    expect(await own()).toMatchObject({ status: 'VERIFIED', consentGiven: false })

    expect((await send('PUT', '/api/account/access-profile', declaration(AS_VERIFIED), patron.cookie)).status).toBe(200)
    expect(await own()).toMatchObject({ status: 'VERIFIED', consentGiven: true })
  })

  test('two switches racing to the same answer record one change (0003, 0006)', async () => {
    const trail = (): number => count(
      `SELECT count(*) AS n FROM audit_log WHERE action = 'access-profile.consent.changed' AND target = ?`, `user:${patron.id}`,
    )
    const before = trail()
    const answers = await race(2, () => send('PUT', '/api/account/access-profile/consent', { consent: false }, patron.cookie))
    expect(answers.map(answer => answer.status)).toEqual([200, 200])
    expect(trail()).toBe(before + 1)

    expect((await send('PUT', '/api/account/access-profile/consent', { consent: true }, patron.cookie)).status).toBe(200)
  })

  test('the owner\'s page shows the agreed wording, when it runs out, and consent as a switch of its own', async () => {
    const view = await patronOnAccessPage()
    expect(await textOf(view, '[data-test="access-wording"]')).toContain('Aisle seat, own wheelchair')
    expect(await textOf(view, '[data-test="access-expiry"]')).toMatch(/\d{4}/)
    expect(await view.evaluate<string | null>(`document.querySelector('[data-test="access-consent"]')?.getAttribute('role') ?? null`)).toBe('switch')
    expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="access-form"] [data-test="access-consent"]'))`)).toBe(false)
    view.close()
  }, 120_000)

  test('a real change goes back to the officer and retires the wording until it is verified again', async () => {
    const changed = await send('PUT', '/api/account/access-profile', declaration({ ...AS_VERIFIED, companions: 2 }), patron.cookie)
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ repended: true })
    expect(await own()).toMatchObject({ status: 'PENDING', fohNote: null, expiresAt: null })

    const verified = await decide(patron.id, 'verify', { fohNote: 'Aisle seat, own wheelchair' })
    expect(verified.status).toBe(200)
    expect((await own()).status).toBe('VERIFIED')
  })
})

describe.skipIf(skip !== null)('the owner is told, and told nothing declared or decided (criterion 8, issue 1334)', () => {
  let declined: TestMember
  const reason = 'The number given is not the one on the Access Card'

  test('verifying sends a message that names no wording', async () => {
    expect(count(`SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'access-profile.verified'`, patron.id)).toBeGreaterThan(0)
    const inbox = row<{ title: string, body: string | null }>(
      `SELECT title, body FROM inbox_items WHERE user_id = ? AND type = 'access-profile.verified'`, patron.id,
    )
    expect(inbox?.title).toBe('Your access requirements are verified')
    expect(inbox?.body ?? '').not.toContain('Aisle seat')
  })

  test('a decline needs a reason, keeps it in the encrypted payload for the owner, and says only that there is one', async () => {
    declined = await registerMember(app, 'declined', generatePassword())
    expect((await send('PUT', '/api/account/access-profile', declaration(), declined.cookie)).status).toBe(200)

    const bare = await withoutSecondFactor(() => send('POST', `/api/admin/access-profiles/${declined.id}/decline`, {}, accessOfficer.cookie))
    expect(bare.status).toBe(400)
    const answered = await decide(declined.id, 'decline', { reason })
    expect(answered.status).toBe(200)

    expect(await own(declined)).toMatchObject({ status: 'DECLINED', declineReason: reason })
    const stored = row<{ encrypted_payload: string }>('SELECT encrypted_payload FROM access_profiles WHERE user_id = ?', declined.id)
    expect(stored!.encrypted_payload).not.toContain('Access Card')
    const trail = row<{ detail: string | null }>(`SELECT detail FROM audit_log WHERE action = 'access-profile.declined' AND target = ?`, `user:${declined.id}`)
    expect(trail?.detail ?? '').not.toContain('Access Card')

    const inbox = row<{ title: string, body: string | null }>(
      `SELECT title, body FROM inbox_items WHERE user_id = ? AND type = 'access-profile.declined'`, declined.id,
    )
    expect(inbox?.title).toBe('We could not verify your access requirements')
    expect(inbox?.body ?? '').not.toContain('Access Card')
  })

  test('the officer reading the declined profile is not shown the reason (criterion 8)', async () => {
    const answered = await withoutSecondFactor(() => send('GET', `/api/admin/access-profiles/${declined.id}`, undefined, accessOfficer.cookie))
    expect(answered.status).toBe(200)
    const { profile } = await answered.json() as { profile: Record<string, unknown> }
    expect(profile).not.toHaveProperty('declineReason')
  })

  test('saving a declined profile again, unchanged, asks to be checked again and clears the reason', async () => {
    const saved = await send('PUT', '/api/account/access-profile', declaration({ accessCardNumber: null }), declined.cookie)
    expect(await saved.json()).toMatchObject({ repended: true })
    expect(await own(declined)).toMatchObject({ status: 'PENDING', declineReason: null })
  })
})

describe.skipIf(skip !== null)('a decision holds only for the declaration the officer read (issue 1383, 0003)', () => {
  const CHANGED = 'This declaration has changed since you opened it. Reload to see the latest.'

  async function declared(prefix: string): Promise<TestMember> {
    const member = await registerMember(app, prefix, generatePassword())
    expect((await send('PUT', '/api/account/access-profile', declaration(), member.cookie)).status).toBe(200)
    return member
  }

  const verifyAs = (userId: string, version: string | null): Promise<Response> => withoutSecondFactor(() =>
    send('POST', `/api/admin/access-profiles/${userId}/verify`, { fohNote: 'Aisle seat', version }, accessOfficer.cookie))

  test('the officer reads a version, and a decision without one is refused', async () => {
    const member = await declared('versioned')
    expect(typeof await versionOf(member.id)).toBe('string')
    const unversioned = await withoutSecondFactor(() =>
      send('POST', `/api/admin/access-profiles/${member.id}/verify`, { fohNote: 'Aisle seat' }, accessOfficer.cookie))
    expect(unversioned.status).toBe(400)
  })

  test('a member\'s change after the officer read refuses the verification, and the change stands', async () => {
    const member = await declared('changed-under')
    const seen = await versionOf(member.id)
    expect((await send('PUT', '/api/account/access-profile', declaration({ companions: 2, requesterNote: 'Uses a wheelchair and a stick' }), member.cookie)).status).toBe(200)

    const stale = await verifyAs(member.id, seen)
    expect(stale.status).toBe(409)
    expect((await stale.json() as { statusMessage?: string }).statusMessage).toBe(CHANGED)
    expect(await own(member)).toMatchObject({ status: 'PENDING', companions: 2, requesterNote: 'Uses a wheelchair and a stick' })
    expect(count(`SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'access-profile.verified'`, member.id)).toBe(0)
  })

  test('the same holds for a decline', async () => {
    const member = await declared('declined-under')
    const seen = await versionOf(member.id)
    expect((await send('PUT', '/api/account/access-profile', declaration({ companions: 0 }), member.cookie)).status).toBe(200)

    const stale = await withoutSecondFactor(() =>
      send('POST', `/api/admin/access-profiles/${member.id}/decline`, { reason: 'Could not check the card', version: seen }, accessOfficer.cookie))
    expect(stale.status).toBe(409)
    expect(await own(member)).toMatchObject({ status: 'PENDING', companions: 0, declineReason: null })
  })

  test('a consent switch is not a change to the declaration, so the officer\'s read still stands', async () => {
    const member = await declared('switched-under')
    const seen = await versionOf(member.id)
    expect((await send('PUT', '/api/account/access-profile/consent', { consent: false }, member.cookie)).status).toBe(200)
    expect(await versionOf(member.id)).toBe(seen)
    expect((await verifyAs(member.id, seen)).status).toBe(200)
  })

  test('a member\'s save racing an officer\'s verify: the save is never lost, and a verify on the old declaration never lands after it', async () => {
    for (let round = 0; round < 4; round++) {
      const member = await declared(`raced-${round}`)
      const seen = await versionOf(member.id)
      const [saved, verified] = await Promise.all([
        send('PUT', '/api/account/access-profile', declaration({ companions: 2, requesterNote: `Round ${round}` }), member.cookie),
        verifyAs(member.id, seen),
      ])
      expect(saved.status).toBe(200)
      expect([200, 409]).toContain(verified.status)

      // Either the verify landed first and the save re-pended it, or the save landed first and the verify was refused.
      expect(await own(member)).toMatchObject({ status: 'PENDING', companions: 2, requesterNote: `Round ${round}`, fohNote: null })
    }
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

  test('the consent switch puts nothing back: withdrawn is refused, and no profile is not there to switch (criterion 7)', async () => {
    expect((await send('PUT', '/api/account/access-profile/consent', { consent: true }, patron.cookie)).status).toBe(409)
    expect((await send('PUT', '/api/account/access-profile/consent', { consent: true }, boxOffice.cookie)).status).toBe(404)
  })

  test('a withdrawn profile cannot be verified: only the owner reinstates it', async () => {
    const attempt = await decide(patron.id, 'verify', { fohNote: 'Should not apply' })
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

    expect((await send('POST', '/api/account/close', { email: gone.email }, gone.cookie)).status).toBe(200)
    expect(row('SELECT user_id FROM access_profiles WHERE user_id = ?', gone.id)).toBeUndefined()
  })
})

async function patronOnAccessPage(): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', patron.email)
  await fill(view, 'form input[type="password"]', patronPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  await visit(view, `${app.baseURL}/account/access`, '[data-test="access-form"]')
  return view
}

function ticked(flag: string): string {
  return `document.querySelector('[data-test="flag-${flag}"]')?.getAttribute('aria-checked') === 'true'`
}

describe.skipIf(skip !== null)('the screens', () => {
  test('the patron declares access requirements from their own account page', async () => {
    const view = await patronOnAccessPage()
    const text = await textOf(view, '[data-test="access-form"]')
    expect(text).toContain('What do you need?')
    view.close()
  }, 120_000)

  test('each need is its own row, at least 48px tall with its own id, so tapping its words ticks that need and no other (issue 1333, K-101)', async () => {
    const view = await patronOnAccessPage()
    const ids = await view.evaluate<string[]>(
      `[...document.querySelectorAll('[data-test="access-needs"] [role="checkbox"]')].map(box => box.id)`,
    )
    expect(ids).toHaveLength(ACCESS_FLAGS.length)
    expect(new Set(ids).size).toBe(ACCESS_FLAGS.length)

    const heights = await view.evaluate<number[]>(
      `[...document.querySelectorAll('[data-test="access-needs"] label')].map(label => label.getBoundingClientRect().height)`,
    )
    expect(heights).toHaveLength(ACCESS_FLAGS.length)
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(48)

    expect(await view.evaluate<boolean>(ticked('standing'))).toBe(false)
    expect(await view.evaluate<boolean>(ticked('crowds'))).toBe(false)
    await view.evaluate(`[...document.querySelectorAll('[data-test="access-needs"] label')]
      .find(label => label.innerText.trim() === ${JSON.stringify(ACCESS_FLAG_LABELS.crowds)}).click()`)
    await waitFor(view, ticked('crowds'))
    expect(await view.evaluate<boolean>(ticked('standing'))).toBe(false)
    view.close()
  }, 120_000)
})
