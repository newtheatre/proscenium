import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-114 through the real routes, keyed to a performance since E-128. The pure statement and
// query builders are pinned against the real migrations in `tests/integration/checklist.test.ts`.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let house: { venueId: string, performanceId: string }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'checklist-foh', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'checklist-house' })
    house = { venueId: made.venueId, performanceId: made.performanceId }
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

interface Item { id: string, label: string, phase: string, required: boolean, systemCheck: string | null }

describe.skipIf(skip !== null)('committee configuration (E-114 criterion 1)', () => {
  test('pre-show lists above post-show on the committee overview, whatever order they were added', async () => {
    const post = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'POST', label: 'Ordering: post', sort: 1, required: true })
    expect(post.status).toBe(200)
    const pre = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'PRE', label: 'Ordering: pre', sort: 1, required: true })
    expect(pre.status).toBe(200)

    const overview = await send('GET', '/api/admin/checklist')
    const { venues } = await overview.json() as { venues: { venueId: string, items: { phase: string, label: string }[] }[] }
    const items = venues.find(venue => venue.venueId === house.venueId)!.items
    expect(items[0]).toMatchObject({ phase: 'PRE', label: 'Ordering: pre' })
    expect(items.find(item => item.label === 'Ordering: post')?.phase).toBe('POST')
    expect(items.findIndex(item => item.phase === 'PRE')).toBeLessThan(items.findIndex(item => item.phase === 'POST'))
  })

  test('an administrator can add, edit and retire a checklist item', async () => {
    const created = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'PRE', label: 'Fire exits checked', sort: 1, required: true })
    expect(created.status).toBe(200)
    const { id } = await created.json() as { id: string }

    const edited = await send('PUT', `/api/admin/checklist/items/${id}`, { venueId: house.venueId, phase: 'PRE', label: 'Fire exits and extinguishers checked', sort: 1, required: true })
    expect(edited.status).toBe(200)

    const listed = await send('GET', `/api/admin/checklist/items?venueId=${house.venueId}`)
    const { items } = await listed.json() as { items: Item[] }
    expect(items.find(item => item.id === id)?.label).toBe('Fire exits and extinguishers checked')

    const retired = await send('POST', `/api/admin/checklist/items/${id}/status`, { venueId: house.venueId, active: false })
    expect(retired.status).toBe(200)
    const afterRetire = await send('GET', `/api/admin/checklist/items?venueId=${house.venueId}`)
    expect((await afterRetire.json() as { items: Item[] }).items.find(item => item.id === id)).toBeUndefined()
  })

  test('an ordinary member cannot configure the checklist', async () => {
    const member = await registerMember(app, 'checklist-nobody', generatePassword())
    expect((await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'PRE', label: 'x', sort: 1, required: true }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('tonight\'s checklist (E-114 criteria 2, 3)', () => {
  test('a hand-ticked item ticks, and a system-verified one cannot be hand-ticked', async () => {
    const manual = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'PRE', label: 'Till float counted', sort: 1, required: true })
    const { id: manualId } = await manual.json() as { id: string }
    const systemVerified = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'POST', label: 'No-show holds released', sort: 1, required: true, systemCheck: 'NO_SHOW_HOLDS_RELEASED' })
    const { id: systemId } = await systemVerified.json() as { id: string }

    const read1 = await send('GET', '/api/tonight/checklist', undefined, foh.cookie)
    expect(read1.status).toBe(200)
    const { items } = await read1.json() as { items: { id: string, itemId: string, systemCheck: string | null, done: boolean }[] }
    const manualStamp = items.find(entry => entry.itemId === manualId)
    const systemStamp = items.find(entry => entry.itemId === systemId)
    expect(manualStamp).toBeDefined()
    expect(systemStamp?.done).toBe(true)

    const ticked = await send('POST', `/api/tonight/checklist/${manualStamp!.id}/tick`, undefined, foh.cookie)
    expect(ticked.status).toBe(200)

    const cannotTick = await send('POST', `/api/tonight/checklist/${systemStamp!.id}/tick`, undefined, foh.cookie)
    expect(cannotTick.status).toBe(409)
  })

  test('an ordinary member cannot read or tick tonight\'s checklist', async () => {
    const member = await registerMember(app, 'checklist-reader', generatePassword())
    expect((await send('GET', '/api/tonight/checklist', undefined, member.cookie)).status).toBe(403)
  })

  test('an exemption records a reason and settles the item', async () => {
    const created = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'POST', label: 'Backstage swept', sort: 2, required: true })
    const { id: itemId } = await created.json() as { id: string }

    const read1 = await send('GET', '/api/tonight/checklist', undefined, foh.cookie)
    const { items } = await read1.json() as { items: { id: string, itemId: string }[] }
    const stamp = items.find(entry => entry.itemId === itemId)!

    const exempted = await send('POST', `/api/tonight/checklist/${stamp.id}/exempt`, { reason: 'Nobody was rota\'d for cleaning tonight' }, foh.cookie)
    expect(exempted.status).toBe(200)

    const row = read<{ exempted: number, exempt_reason: string }>('SELECT exempted, exempt_reason FROM checklist_stamps WHERE id = ?', stamp.id)
    expect(row).toMatchObject({ exempted: 1, exempt_reason: 'Nobody was rota\'d for cleaning tonight' })
  })
})

describe.skipIf(skip !== null)('closing the night (E-114 criterion 4)', () => {
  test('closing is blocked while a required item is unticked, and names it', async () => {
    const venue = await send('POST', '/api/admin/checklist/items', { venueId: house.venueId, phase: 'POST', label: 'Till reconciled', sort: 9, required: true })
    expect(venue.status).toBe(200)

    const blocked = await send('POST', '/api/tonight/checklist/close', undefined, foh.cookie)
    expect(blocked.status).toBe(409)
    const body = await blocked.json() as { statusMessage?: string, message?: string }
    expect(body.statusMessage ?? body.message ?? '').toContain('Till reconciled')
  })

  test('closing succeeds once every required item is ticked or exempted, a reload still knows it, and a second close refuses', async () => {
    const read1 = await send('GET', '/api/tonight/checklist', undefined, foh.cookie)
    const { items } = await read1.json() as { items: { id: string, required: boolean, done: boolean, systemCheck: string | null }[] }

    for (const entry of items) {
      if (entry.systemCheck || entry.done) continue
      await send('POST', `/api/tonight/checklist/${entry.id}/exempt`, { reason: 'Closing out the fixture' }, foh.cookie)
    }

    const closed = await send('POST', '/api/tonight/checklist/close', undefined, foh.cookie)
    expect(closed.status).toBe(200)

    // A fresh read, not the close response: this is what a reloaded screen actually sees.
    const reread = await send('GET', '/api/tonight/checklist', undefined, foh.cookie)
    const { close } = await reread.json() as { close: { closedAt: number, closedByName: string } | null }
    expect(close?.closedByName).toBeTruthy()

    const closedAgain = await send('POST', '/api/tonight/checklist/close', undefined, foh.cookie)
    expect(closedAgain.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('reviewing an incident (E-114 criterion 3)', () => {
  test('a duty manager can mark an incident reviewed', async () => {
    const logged = await send('POST', '/api/tonight/incidents', { performanceId: house.performanceId, category: 'SAFETY', severity: 'NOTE', body: 'Nothing to report.' }, foh.cookie)
    const { id } = await logged.json() as { id: string }

    const reviewed = await send('POST', `/api/tonight/incidents/${id}/review`, undefined, foh.cookie)
    expect(reviewed.status).toBe(200)

    const row = read<{ action: string }>(`SELECT action FROM audit_log WHERE target = ? AND action = 'incident.reviewed'`, `incident:${id}`)
    expect(row?.action).toBe('incident.reviewed')
  })

  test('reviewing a missing incident 404s', async () => {
    expect((await send('POST', '/api/tonight/incidents/no-such-entry/review', undefined, foh.cookie)).status).toBe(404)
  })
})

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function shift(performanceId: string, role: string, userId: string): void {
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
    `${performanceId}-${role}`, performanceId, role, userId, 'CONFIRMED')
}

describe.skipIf(skip !== null)('two performances, one venue, one day (E-128)', () => {
  test('a matinee and an evening keep their own checklist, and closing one does not touch the other', async () => {
    const dm = await registerMember(app, 'checklist-matinee-dm', generatePassword())
    const { venueId, matineeId, eveningId } = (() => {
      const database = new Database(app.databaseFile)
      try {
        const target = sqliteTarget(database)
        const venue = testVenue(target, { suffix: 'checklist-matinee-house' })
        const matinee = tonightsPerformance(target, { suffix: 'checklist-matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
        const evening = tonightsPerformance(target, { suffix: 'checklist-evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
        return { venueId: venue.id, matineeId: matinee.performanceId, eveningId: evening.performanceId }
      }
      finally {
        database.close()
      }
    })()
    shift(matineeId, 'DUTY_MANAGER', dm.id)
    shift(eveningId, 'DUTY_MANAGER', dm.id)

    const created = await send('POST', '/api/admin/checklist/items', { venueId, phase: 'PRE', label: 'Fire exits checked', sort: 1, required: true })
    expect(created.status).toBe(200)

    const ambiguous = await send('GET', '/api/tonight/checklist', undefined, dm.cookie)
    expect(ambiguous.status).toBe(400)

    const matineeRead = await send('GET', `/api/tonight/checklist?performanceId=${matineeId}`, undefined, dm.cookie)
    const { items: matineeItems } = await matineeRead.json() as { items: { id: string }[] }
    const matineeStamp = matineeItems[0]!

    const eveningRead = await send('GET', `/api/tonight/checklist?performanceId=${eveningId}`, undefined, dm.cookie)
    const { items: eveningItems } = await eveningRead.json() as { items: { id: string, done: boolean }[] }
    expect(eveningItems[0]!.id).not.toBe(matineeStamp.id)
    expect(eveningItems[0]!.done).toBe(false)

    const ticked = await send('POST', `/api/tonight/checklist/${matineeStamp.id}/tick`, { performanceId: matineeId }, dm.cookie)
    expect(ticked.status).toBe(200)

    const closedMatinee = await send('POST', '/api/tonight/checklist/close', { performanceId: matineeId }, dm.cookie)
    expect(closedMatinee.status).toBe(200)

    const eveningStillOpen = await send('GET', `/api/tonight/checklist?performanceId=${eveningId}`, undefined, dm.cookie)
    const { close: eveningClose, items: eveningAfter } = await eveningStillOpen.json() as { close: unknown, items: { done: boolean }[] }
    expect(eveningClose).toBeNull()
    expect(eveningAfter[0]!.done).toBe(false)

    const eveningExempted = await send('POST', `/api/tonight/checklist/${eveningItems[0]!.id}/exempt`, { performanceId: eveningId, reason: 'Evening closes on its own record' }, dm.cookie)
    expect(eveningExempted.status).toBe(200)
    const closedEvening = await send('POST', '/api/tonight/checklist/close', { performanceId: eveningId }, dm.cookie)
    expect(closedEvening.status).toBe(200)
  })
})
