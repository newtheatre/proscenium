// Signing up, FH-09 to FH-15 and FH-17: open shifts with reasons, confirmation and its message,
// a manager confirming, declining, assigning (with an override) and removing; releasing inside and
// outside the notice; cover in one batch; reminders sent at most twice; and "My shifts".
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { sendReminders } from '../../server/reminders'
import { env, inContext, rows } from '../../../../tests/integration/helpers'
import { duty, notes, performance, ready, req, setting, shift, shiftRow, volunteer, MINUTE } from './stage'

beforeAll(ready)
afterEach(() => setClock(undefined))

const HOUR = 60 * MINUTE
const assignment = async (id: string) => (await rows<{ state: string, source: string, release_reason: string | null }>('SELECT state, source, release_reason FROM front_of_house_assignments WHERE id = ?', id))[0]!
const remind = () => inContext(async () => {
  const unit = createUnit()
  const sent = await sendReminders(unit.view())
  await unit.commit()
  return sent
})

describe('FH-10 and FH-11: confirmation', () => {
  it('confirms a sign-up at once and tells the person', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const ann = volunteer()
    const signed = await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ann)
    expect(signed.body.state).toBe('confirmed')
    expect(await notes('front-of-house.shift-confirmed', ann.accountId!)).toHaveLength(1)
  })

  it('makes sign-ups wait for a manager when the theatre vets volunteers', async () => {
    await setting('front-of-house.shifts.confirmation', 'manager')
    try {
      const p = await performance()
      const id = await shift(p.id, await duty('Steward'), 3)
      const [bob, cat] = [volunteer(), volunteer()]
      const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, bob)).body.assignmentId
      const c = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, cat)).body.assignmentId
      expect(await notes('front-of-house.shift-confirmed', bob.accountId!)).toHaveLength(0)
      expect((await req('POST', `/api/front-of-house/assignments/${b}/confirm`, {})).status).toBe(200)
      expect(await assignment(b)).toMatchObject({ state: 'confirmed' })
      expect(await notes('front-of-house.shift-confirmed', bob.accountId!)).toHaveLength(1)
      expect((await req('POST', `/api/front-of-house/assignments/${c}/decline`, {})).status).toBe(200)
      expect(await assignment(c)).toMatchObject({ state: 'declined' })
      expect((await shiftRow(id)).places_taken).toBe(1)
      // Only a request can be confirmed.
      expect((await req('POST', `/api/front-of-house/assignments/${c}/confirm`, {})).body.code).toBe('front-of-house.not-requested')
    }
    finally {
      await setting('front-of-house.shifts.confirmation', 'automatic')
    }
  })
})

describe('FH-12: a manager assigns someone', () => {
  it('refuses an unmet requirement unless overridden, and audits the override', async () => {
    const p = await performance()
    // Only someone already on shift may take it: nobody here is.
    const id = await shift(p.id, await duty('Steward', { requirements: ['fact:front-of-house.on-shift'] }))
    const dan = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, dan)).body.code).toBe('front-of-house.not-eligible')
    expect((await req('POST', `/api/front-of-house/shifts/${id}/assign`, { accountId: dan.accountId })).body.code).toBe('front-of-house.not-eligible')
    const assigned = await req('POST', `/api/front-of-house/shifts/${id}/assign`, { accountId: dan.accountId, override: true })
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    expect(assigned.body.warnings.length).toBeGreaterThan(0)
    expect(await assignment(assigned.body.assignmentId)).toMatchObject({ state: 'confirmed', source: 'assigned' })
    const audit = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE record_id = ?', assigned.body.assignmentId)
    expect(audit.some(a => JSON.parse(a.detail ?? '{}').override === true)).toBe(true)
  })

  it('removes someone and tells them', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const eve = volunteer()
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, eve)).body.assignmentId
    expect((await req('POST', `/api/front-of-house/assignments/${a}/remove`, {})).status).toBe(200)
    expect(await assignment(a)).toMatchObject({ state: 'removed' })
    expect((await shiftRow(id)).places_taken).toBe(0)
    expect(await notes('front-of-house.shift-removed', eve.accountId!)).toHaveLength(1)
  })
})

describe('FH-13 and FH-14: release and cover', () => {
  it('releases at once outside the notice period', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const fay = volunteer()
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, fay)).body.assignmentId
    // Someone else cannot release it.
    expect((await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, volunteer())).status).toBe(403)
    const released = await req('POST', `/api/front-of-house/assignments/${a}/release`, { reason: 'Exam' }, fay)
    expect(released.body).toEqual({ state: 'released' })
    expect(await assignment(a)).toMatchObject({ state: 'released', release_reason: 'Exam' })
    expect((await shiftRow(id)).places_taken).toBe(0)
  })

  it('asks for cover inside the notice; the person may keep it; another member takes it in one batch', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 1)
    const [gus, hal] = [volunteer(), volunteer()]
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, gus)).body.assignmentId
    setClock(Number((await shiftRow(id)).call_at) - 24 * HOUR)
    expect((await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, gus)).body).toEqual({ state: 'release_requested' })
    expect((await shiftRow(id)).places_taken).toBe(1)
    expect((await req('POST', `/api/front-of-house/assignments/${a}/keep`, {}, gus)).status).toBe(200)
    expect(await assignment(a)).toMatchObject({ state: 'confirmed' })
    await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, gus)

    // Open shifts show it as needing cover, though the shift has no free place.
    const open = (await req('GET', '/api/front-of-house/open-shifts', undefined, hal)).body.shifts
    expect(open.find((s: any) => s.id === id)).toMatchObject({ coverFor: a, placesFree: 0 })
    expect((await req('POST', `/api/front-of-house/assignments/${a}/cover`, {}, gus)).body.code).toBe('front-of-house.own-place')
    const taken = await req('POST', `/api/front-of-house/assignments/${a}/cover`, {}, hal)
    expect(taken.status, JSON.stringify(taken.body)).toBe(200)
    expect(await assignment(a)).toMatchObject({ state: 'released' })
    expect(await assignment(taken.body.assignmentId)).toMatchObject({ state: 'confirmed', source: 'cover' })
    expect((await shiftRow(id)).places_taken).toBe(1)
    expect(await notes('front-of-house.cover-taken', gus.accountId!)).toHaveLength(1)
    expect(await notes('front-of-house.shift-confirmed', hal.accountId!)).toHaveLength(1)
    // Too late to keep it now.
    expect((await req('POST', `/api/front-of-house/assignments/${a}/keep`, {}, gus)).body.code).toBe('front-of-house.cover-taken')
  })

  it('lets a request be withdrawn', async () => {
    await setting('front-of-house.shifts.confirmation', 'manager')
    try {
      const p = await performance()
      const id = await shift(p.id, await duty('Steward'))
      const ivy = volunteer()
      const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ivy)).body.assignmentId
      expect((await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, ivy)).body).toEqual({ state: 'withdrawn' })
      expect((await shiftRow(id)).places_taken).toBe(0)
    }
    finally {
      await setting('front-of-house.shifts.confirmation', 'automatic')
    }
  })
})

describe('FH-15: reminders', () => {
  it('sends at most two, never repeated, and one only to a late sign-up', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 3)
    const jan = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, jan)
    const callAt = Number((await shiftRow(id)).call_at)
    setClock(callAt - 50 * HOUR)
    expect(await remind()).toBe(0)
    setClock(callAt - 47 * HOUR)
    expect(await remind()).toBe(1)
    expect(await remind()).toBe(0)
    setClock(callAt - 2 * HOUR)
    // Sign-up has closed by now, so the late one is put on by a manager.
    const kit = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${id}/assign`, { accountId: kit.accountId })).status).toBe(200)
    expect(await remind()).toBe(2)
    expect(await remind()).toBe(0)
    expect(await notes('front-of-house.shift-reminder', jan.accountId!)).toHaveLength(2)
    expect(await notes('front-of-house.shift-reminder', kit.accountId!)).toHaveLength(1)
  })
})

describe('FH-09 and FH-17: what members see', () => {
  it('shows a shift the person cannot take, with the reason, and leaves out their own', async () => {
    const p = await performance()
    const free = await shift(p.id, await duty('Usher'))
    const gated = await shift(p.id, await duty('Duty manager', { requirements: ['fact:front-of-house.on-shift'] }))
    const lou = volunteer()
    let open = (await req('GET', '/api/front-of-house/open-shifts', undefined, lou)).body.shifts
    expect(open.find((s: any) => s.id === free)).toMatchObject({ eligible: true, overlaps: false })
    const blocked = open.find((s: any) => s.id === gated)
    expect(blocked.eligible).toBe(false)
    expect(blocked.unmet).toEqual([{ ref: 'fact:front-of-house.on-shift', label: 'front-of-house.facts.on-shift.label' }])
    await req('POST', `/api/front-of-house/shifts/${free}/sign-up`, {}, lou)
    open = (await req('GET', '/api/front-of-house/open-shifts', undefined, lou)).body.shifts
    expect(open.some((s: any) => s.id === free)).toBe(false)
    expect(open.find((s: any) => s.id === gated).overlaps).toBe(true)
  })

  it('lists the person\'s coming shifts and the shift page shows their place', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const meg = volunteer()
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, meg)).body.assignmentId
    const mine = (await req('GET', '/api/front-of-house/me/shifts', undefined, meg)).body
    expect(mine.coming).toEqual([expect.objectContaining({ assignmentId: a, shiftId: id, state: 'confirmed', productionTitle: expect.stringContaining('Front of house show') })])
    expect(mine.minutesThisYear).toBe(0)
    const view = (await req('GET', `/api/front-of-house/shifts/${id}`, undefined, meg)).body
    expect(view.mine).toEqual({ assignmentId: a, state: 'confirmed' })
    expect(view.people).toHaveLength(1)
    expect(view).toMatchObject({ productionTitle: expect.stringContaining('Front of house show'), venueName: expect.stringContaining('Front of house venue'), releaseNotice: 172800, coverFor: null })
    // Once Meg asks for cover inside the notice, another member sees the place to take.
    await env.DB.prepare('UPDATE front_of_house_assignments SET state = \'release_requested\' WHERE id = ?').bind(a).run()
    expect((await req('GET', `/api/front-of-house/shifts/${id}`, undefined, volunteer())).body.coverFor).toBe(a)
  })
})
