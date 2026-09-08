import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { showNightOf } from '#shared/utils/show-night'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// E-107: release and reassignment, through the real routes. `tests/integration/rota.test.ts`
// pins the two UPDATEs directly against the migrations; this is the wiring and the notifications.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let doorModule = ''
let dutyManagerModule = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'foh-release', generatePassword())
  await send('POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' })

  const department = `REL${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Release and reassignment' })).status).toBe(200)
  doorModule = `${department}-${suffix()}`
  dutyManagerModule = `${department}-${suffix()}`
  for (const id of [doorModule, dutyManagerModule]) {
    expect((await send('POST', '/api/admin/training/modules', {
      id, department, kind: 'MODULE', name: `Module ${id}`, status: 'ACTIVE',
    })).status).toBe(200)
  }
  expect((await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_DOOR_MODULE', { value: doorModule })).status).toBe(200)
  expect((await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE', { value: dutyManagerModule })).status).toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

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

function notificationCount(userId: string, type: string): number {
  return read<{ n: number }>(
    'SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = ?', userId, type)?.n ?? 0
}

async function award(userId: string, moduleId = doorModule): Promise<void> {
  write(`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, date('now', '-30 days'), 'SIGNOFF')`,
    `tr-${crypto.randomUUID().slice(0, 8)}`, userId, moduleId)
}

// `daysOut` places the night comfortably that many days away, so the 48-hour notice window is
// never ambiguous with whatever time of day the suite runs (rota-claim.test.ts's own trick).
function performance(daysOut: number, caseSuffix: string, role = 'DOOR'): { performanceId: string, shiftId: string } {
  const database = new Database(app.databaseFile)
  try {
    const night = showNightOf(new Date(Date.now() + daysOut * 86_400_000))
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: caseSuffix, night })
    const shiftId = `${made.performanceId}-${role}-1`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)')
      .run(shiftId, made.performanceId, role, 'OPEN')
    return { performanceId: made.performanceId, shiftId }
  }
  finally {
    database.close()
  }
}

function claim(shiftId: string, userId: string, status = 'CONFIRMED', reason: string | null = null): void {
  write('UPDATE shifts SET user_id = ?, status = ?, claimed_at = unixepoch(), confirmed_at = unixepoch(), decline_reason = ? WHERE id = ?',
    userId, status, reason, shiftId)
}

describe.skipIf(skip !== null)('releasing a shift (E-107 criterion 1)', () => {
  test('the holder releases their own shift, and it returns to open', async () => {
    const holder = await registerMember(app, 'release-holder', generatePassword())
    const house = performance(7, 'release-own')
    claim(house.shiftId, holder.id)

    const answered = await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, holder.cookie)
    expect(answered.status).toBe(200)
    expect(read<{ status: string, user_id: string | null }>('SELECT status, user_id FROM shifts WHERE id = ?', house.shiftId))
      .toMatchObject({ status: 'OPEN', user_id: null })
  })

  test('somebody else cannot release it', async () => {
    const holder = await registerMember(app, 'release-owner', generatePassword())
    const other = await registerMember(app, 'release-stranger', generatePassword())
    const house = performance(7, 'release-not-yours')
    claim(house.shiftId, holder.id)

    const answered = await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, other.cookie)
    expect(answered.status).toBe(403)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', house.shiftId)?.status).toBe('CONFIRMED')
  })

  test('an open shift has nothing to release', async () => {
    const holder = await registerMember(app, 'release-open', generatePassword())
    const house = performance(7, 'release-already-open')

    const answered = await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, holder.cookie)
    expect(answered.status).toBe(409)
  })

  test('a shift on a night already begun cannot be released', async () => {
    const holder = await registerMember(app, 'release-tonight', generatePassword())
    const database = new Database(app.databaseFile)
    let shiftId: string
    try {
      const made = tonightsPerformance({
        batch: statements => database.transaction(() => {
          for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
        })(),
      }, { suffix: 'release-tonight' })
      shiftId = `${made.performanceId}-DOOR-1`
      database.query('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)')
        .run(shiftId, made.performanceId, 'DOOR', 'OPEN')
    }
    finally {
      database.close()
    }
    claim(shiftId, holder.id)

    const answered = await send('POST', `/api/rota/shifts/${shiftId}/release`, undefined, holder.cookie)
    expect(answered.status).toBe(409)
    const body = await answered.json() as { statusMessage: string }
    expect(body.statusMessage).toContain('already begun')
  })

  test('a missing shift 404s', async () => {
    const holder = await registerMember(app, 'release-missing', generatePassword())
    expect((await send('POST', '/api/rota/shifts/no-such-shift/release', undefined, holder.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('the release notice window (E-107 criterion 2)', () => {
  test('a release close to the performance notifies the FOH officer immediately', async () => {
    const holder = await registerMember(app, 'release-near', generatePassword())
    const house = performance(1, 'release-near', 'BAR')
    claim(house.shiftId, holder.id)
    const before = notificationCount(foh.id, 'shift.released')

    expect((await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, holder.cookie)).status).toBe(200)
    expect(notificationCount(foh.id, 'shift.released')).toBeGreaterThan(before)
  })

  test('a release far ahead of the performance is not chased immediately', async () => {
    const holder = await registerMember(app, 'release-far', generatePassword())
    const house = performance(7, 'release-far', 'BAR')
    claim(house.shiftId, holder.id)
    const before = notificationCount(foh.id, 'shift.released')

    expect((await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, holder.cookie)).status).toBe(200)
    expect(notificationCount(foh.id, 'shift.released')).toBe(before)
  })

  test('a released duty manager shift always notifies immediately, however far out', async () => {
    const holder = await registerMember(app, 'release-dm', generatePassword())
    const house = performance(7, 'release-dm', 'DUTY_MANAGER')
    claim(house.shiftId, holder.id)
    const before = notificationCount(foh.id, 'shift.released')

    expect((await send('POST', `/api/rota/shifts/${house.shiftId}/release`, undefined, holder.cookie)).status).toBe(200)
    expect(notificationCount(foh.id, 'shift.released')).toBeGreaterThan(before)
  })
})

describe.skipIf(skip !== null)('an officer assigning or reassigning a shift (E-107 criteria 3, 4 and 5)', () => {
  test('assigning an eligible member fills an open shift, confirmed by definition', async () => {
    const member = await registerMember(app, 'assign-eligible', generatePassword())
    await award(member.id)
    const house = performance(7, 'assign-open')

    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: member.id }, foh.cookie)
    expect(answered.status).toBe(200)
    expect(read<{ status: string, user_id: string }>('SELECT status, user_id FROM shifts WHERE id = ?', house.shiftId))
      .toMatchObject({ status: 'CONFIRMED', user_id: member.id })

    const notified = notificationCount(member.id, 'shift.assigned')
    expect(notified).toBeGreaterThan(0)
  })

  test('an ineligible member is refused, and the shift is untouched', async () => {
    const member = await registerMember(app, 'assign-ineligible', generatePassword())
    const house = performance(7, 'assign-ineligible')

    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: member.id }, foh.cookie)
    expect(answered.status).toBe(403)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', house.shiftId)?.status).toBe('OPEN')
  })

  // A disabled account is not a fact operational authority may derive from (0009): assigning one
  // a shift must refuse at the write, not merely fail to grant anything once assigned.
  test('a disabled account cannot be assigned a shift, and the shift is untouched', async () => {
    const member = await registerMember(app, 'assign-disabled', generatePassword())
    await award(member.id)
    const house = performance(7, 'assign-disabled')

    expect((await send('POST', `/api/admin/accounts/${member.id}/security`, { operation: 'disable' })).status).toBe(200)

    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: member.id }, foh.cookie)
    expect(answered.status).toBe(403)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', house.shiftId)?.status).toBe('OPEN')
  })

  test('assigning replaces a declined shift, and the outgoing claimant is told', async () => {
    const outgoing = await registerMember(app, 'assign-outgoing', generatePassword())
    const incoming = await registerMember(app, 'assign-incoming', generatePassword())
    await award(incoming.id)
    const house = performance(7, 'assign-declined')
    claim(house.shiftId, outgoing.id, 'DECLINED', 'Double-booked')

    const before = notificationCount(outgoing.id, 'shift.removed')
    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: incoming.id }, foh.cookie)
    expect(answered.status).toBe(200)

    expect(read<{ status: string, user_id: string, decline_reason: string | null }>(
      'SELECT status, user_id, decline_reason FROM shifts WHERE id = ?', house.shiftId))
      .toMatchObject({ status: 'CONFIRMED', user_id: incoming.id, decline_reason: null })
    expect(notificationCount(outgoing.id, 'shift.removed')).toBeGreaterThan(before)
  })

  test('replacing a confirmed duty manager leaves exactly one confirmed duty manager', async () => {
    const outgoing = await registerMember(app, 'assign-dm-out', generatePassword())
    const incoming = await registerMember(app, 'assign-dm-in', generatePassword())
    await award(incoming.id, dutyManagerModule)
    const house = performance(7, 'assign-dm', 'DUTY_MANAGER')
    claim(house.shiftId, outgoing.id)

    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: incoming.id }, foh.cookie)
    expect(answered.status).toBe(200)

    const confirmed = read<{ n: number }>(
      `SELECT count(*) AS n FROM shifts WHERE performance_id = ? AND role = 'DUTY_MANAGER' AND status = 'CONFIRMED'`,
      house.performanceId)?.n ?? -1
    expect(confirmed).toBe(1)
    expect(read<{ user_id: string }>('SELECT user_id FROM shifts WHERE id = ?', house.shiftId)?.user_id).toBe(incoming.id)
  })

  test('a member already committed elsewhere on the performance cannot be assigned a second shift', async () => {
    const member = await registerMember(app, 'assign-double', generatePassword())
    await award(member.id)
    const house = performance(7, 'assign-double')
    write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
      `${house.performanceId}-BAR-2`, house.performanceId, 'BAR', member.id, 'CONFIRMED')

    const answered = await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: member.id }, foh.cookie)
    expect(answered.status).toBe(409)
  })

  test('an ordinary member cannot assign', async () => {
    const member = await registerMember(app, 'assign-forbidden', generatePassword())
    const house = performance(7, 'assign-forbidden')
    expect((await send('POST', `/api/admin/rota/shifts/${house.shiftId}/assign`, { userId: member.id }, member.cookie)).status).toBe(403)
  })

  test('a missing shift 404s', async () => {
    const member = await registerMember(app, 'assign-missing', generatePassword())
    expect((await send('POST', '/api/admin/rota/shifts/no-such-shift/assign', { userId: member.id }, foh.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('who might be assigned (E-107 criterion 3)', () => {
  test('eligibility rides the same live gate self-claiming uses', async () => {
    const eligible = await registerMember(app, 'candidate-eligible', generatePassword())
    await award(eligible.id)
    const locked = await registerMember(app, 'candidate-locked', generatePassword())
    const house = performance(7, 'candidates')

    const answered = await send('GET', `/api/admin/rota/shifts/${house.shiftId}/candidates?search=candidate-`, undefined, foh.cookie)
    expect(answered.status).toBe(200)
    const { items } = await answered.json() as { items: { id: string, eligible: boolean }[] }
    expect(items.find(item => item.id === eligible.id)?.eligible).toBe(true)
    expect(items.find(item => item.id === locked.id)?.eligible).toBe(false)
  })

  test('an ordinary member cannot search candidates', async () => {
    const member = await registerMember(app, 'candidate-forbidden', generatePassword())
    const house = performance(7, 'candidates-forbidden')
    expect((await send('GET', `/api/admin/rota/shifts/${house.shiftId}/candidates?search=a`, undefined, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('unfilled shifts (E-107, `docs/known-issues.md`)', () => {
  test('an open and a declined shift both list, and a confirmed one does not', async () => {
    const holder = await registerMember(app, 'unfilled-holder', generatePassword())
    const open = performance(7, 'unfilled-open')
    const declined = performance(7, 'unfilled-declined')
    const confirmed = performance(7, 'unfilled-confirmed')
    claim(declined.shiftId, holder.id, 'DECLINED', 'Changed plans')
    claim(confirmed.shiftId, holder.id)

    const listed = await send('GET', '/api/admin/rota/shifts?pageSize=100', undefined, foh.cookie)
    expect(listed.status).toBe(200)
    const { items } = await listed.json() as { items: { shiftId: string }[] }
    const ids = items.map(item => item.shiftId)
    expect(ids).toContain(open.shiftId)
    expect(ids).toContain(declined.shiftId)
    expect(ids).not.toContain(confirmed.shiftId)
  })
})
