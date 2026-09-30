import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { londonParts } from '#shared/utils/london'
import { showNightOf } from '#shared/utils/show-night'
import { committeeShiftRefusal } from '#shared/utils/night-authority'
import { adminSession, grantCommitteeRole, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// Decision 0115 through the real routes, each refusal naming the committee role; what each writing
// statement refuses is pinned in `tests/integration/duty-manager-committee.test.ts`.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const FOR_COMMITTEE = 'A duty manager shift is for committee members'

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let moduleId = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'dm-committee-officer', generatePassword())
  await grantRole(app, foh, 'FOH_MANAGER', admin.cookie)

  const department = `DMC${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Duty managers' })).status).toBe(200)
  moduleId = `${department}-${suffix()}`
  expect((await send('POST', '/api/admin/training/modules', {
    id: moduleId, department, kind: 'MODULE', name: `Module ${moduleId}`, status: 'ACTIVE',
  })).status).toBe(200)
  expect((await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE', { value: moduleId })).status).toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

const refusal = async (answered: Response): Promise<{ statusMessage: string, data?: { declineReason?: string } }> =>
  await answered.json() as { statusMessage: string, data?: { declineReason?: string } }

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
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

// Holding the duty manager module, so only the committee role decides what happens.
async function trainedMember(prefix: string): Promise<TestMember> {
  const member = await registerMember(app, prefix, generatePassword())
  write(`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, 'SIGNOFF')`,
    `tr-${crypto.randomUUID().slice(0, 8)}`, member.id, moduleId, daysFrom(-30))
  return member
}

// `days` ahead: a week out for the rota, so the open list's "not yet started" filter never bites;
// nought for the night's own authority, which is tonight's alone.
function performance(caseSuffix: string, days: number): string {
  const database = new Database(app.databaseFile)
  try {
    const night = showNightOf(new Date(Date.now() + days * 86_400_000))
    return tonightsPerformance(sqliteTarget(database), { suffix: caseSuffix, night }).performanceId
  }
  finally {
    database.close()
  }
}

function dutyManagerShift(performanceId: string, status: 'OPEN' | 'CLAIMED' | 'CONFIRMED', userId: string | null = null): string {
  const id = `${performanceId}-DUTY_MANAGER-1`
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, \'DUTY_MANAGER\', 1, ?, ?)', id, performanceId, userId, status)
  return id
}

const statusOf = (shiftId: string): string | undefined => read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', shiftId)?.status

describe.skipIf(skip !== null)('claiming a duty manager shift (E-103 criterion 6)', () => {
  test('without a committee role, the shift is not offered and the claim is refused naming why', async () => {
    const member = await trainedMember('dm-no-committee')
    const shiftId = dutyManagerShift(performance('dm-claim-refused', 7), 'OPEN')

    const listed = await (await send('GET', '/api/rota/shifts', undefined, member.cookie)).json() as { items: { shiftId: string, eligible: boolean, needsCommittee: boolean, unlockedBy: unknown }[] }
    expect(listed.items.find(item => item.shiftId === shiftId)).toMatchObject({ eligible: false, needsCommittee: true, unlockedBy: null })

    const roles = await (await send('GET', '/api/rota/roles', undefined, member.cookie)).json() as { roles: { role: string }[] }
    expect(roles.roles.map(card => card.role)).not.toContain('DUTY_MANAGER')

    const answered = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)
    expect(answered.status).toBe(403)
    expect((await refusal(answered)).statusMessage).toBe(`${FOR_COMMITTEE}, and you do not hold a committee role`)
    expect(statusOf(shiftId)).toBe('OPEN')
  })

  test('with the Committee role, the same member claims it', async () => {
    const member = await trainedMember('dm-committee')
    grantCommitteeRole(app, member.id)
    const shiftId = dutyManagerShift(performance('dm-claim-allowed', 7), 'OPEN')

    expect((await send('POST', `/api/rota/shifts/${shiftId}/claim`, { shareNumber: false }, member.cookie)).status).toBe(200)
    expect(read<{ user_id: string }>('SELECT user_id FROM shifts WHERE id = ?', shiftId)?.user_id).toBe(member.id)
  })
})

describe.skipIf(skip !== null)('an officer assigning or confirming a duty manager (E-107 criterion 3, E-105 criterion 3)', () => {
  test('assigning somebody without a committee role is refused, naming them', async () => {
    const member = await trainedMember('dm-assignee')
    const shiftId = dutyManagerShift(performance('dm-assign-refused', 7), 'OPEN')

    const answered = await send('POST', `/api/admin/rota/shifts/${shiftId}/assign`, { userId: member.id }, foh.cookie)
    expect(answered.status).toBe(403)
    expect((await refusal(answered)).statusMessage).toBe(`${FOR_COMMITTEE}, and ${member.name} does not hold a committee role`)
    expect(statusOf(shiftId)).toBe('OPEN')
  })

  test('assigning a committee member confirms them', async () => {
    const member = await trainedMember('dm-assignee-committee')
    grantCommitteeRole(app, member.id)
    const shiftId = dutyManagerShift(performance('dm-assign-allowed', 7), 'OPEN')

    expect((await send('POST', `/api/admin/rota/shifts/${shiftId}/assign`, { userId: member.id }, foh.cookie)).status).toBe(200)
    expect(statusOf(shiftId)).toBe('CONFIRMED')
  })

  test('a queued claim whose claimant has left the committee is not confirmed, and offers a decline reason saying so', async () => {
    const member = await trainedMember('dm-resigned')
    const shiftId = dutyManagerShift(performance('dm-queue-resigned', 7), 'CLAIMED', member.id)

    const answered = await send('POST', `/api/admin/rota/approvals/${shiftId}/approve`, undefined, foh.cookie)
    expect(answered.status).toBe(409)
    const body = await refusal(answered)
    expect(body.statusMessage).toBe(`No longer qualifies: ${member.name} no longer holds a committee role, which a duty manager shift needs`)
    expect(body.data?.declineReason).toBe('A duty manager shift is for committee members, and you no longer hold a committee role.')
    expect(statusOf(shiftId)).toBe('CLAIMED')

    grantCommitteeRole(app, member.id)
    expect((await send('POST', `/api/admin/rota/approvals/${shiftId}/approve`, undefined, foh.cookie)).status).toBe(200)
    expect(statusOf(shiftId)).toBe('CONFIRMED')
  })
})

describe.skipIf(skip !== null)('a confirmed duty manager shift on the night (E-111 criterion 1)', () => {
  test('opens nothing for a holder without a committee role, and says what is missing', async () => {
    const member = await trainedMember('dm-tonight-no-committee')
    dutyManagerShift(performance('dm-night-refused', 0), 'CONFIRMED', member.id)

    const answered = await send('GET', '/api/tonight/duty-manager', undefined, member.cookie)
    expect(answered.status).toBe(403)
    expect((await refusal(answered)).statusMessage).toBe(committeeShiftRefusal().statusMessage)
  })

  test('opens the duty manager\'s screen once the holder holds the Committee role', async () => {
    const member = await trainedMember('dm-tonight-committee')
    grantCommitteeRole(app, member.id)
    dutyManagerShift(performance('dm-night-allowed', 0), 'CONFIRMED', member.id)

    expect((await send('GET', '/api/tonight/duty-manager', undefined, member.cookie)).status).toBe(200)
  })

  // The grant is read on every request, so a resignation takes effect on the next one (criterion 3).
  test('stops opening it on the next request after the committee role ends', async () => {
    const member = await trainedMember('dm-tonight-resigning')
    grantCommitteeRole(app, member.id)
    dutyManagerShift(performance('dm-night-resigning', 0), 'CONFIRMED', member.id)
    expect((await send('GET', '/api/tonight/duty-manager', undefined, member.cookie)).status).toBe(200)

    write('UPDATE role_grants SET expires_at = unixepoch() - 1 WHERE user_id = ? AND role = \'COMMITTEE\'', member.id)
    expect((await send('GET', '/api/tonight/duty-manager', undefined, member.cookie)).status).toBe(403)
  })
})
