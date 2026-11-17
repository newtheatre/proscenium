// After the night, FH-31 to FH-34: the draft report from the first window, notes by topic, sign-off
// resolving people with no names in the snapshot, the signed row unchangeable and addenda after it,
// contributed sections, closing shifts, the morning chase, and volunteer hours with their export.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { closeShifts } from '../../server/close'
import { call, env, inContext, person, rows } from '../../../../tests/integration/helpers'
import { duty, handle, manager, performance, ready, req, setting, shift, shiftRow, MINUTE } from './stage'

beforeAll(ready)
afterEach(() => setClock(undefined))

const HOUR = 60 * MINUTE
const lead = () => person(['front-of-house.night-report.sign-off', 'front-of-house.shift.sign-up', 'front-of-house.assignment.check-in'])
const close = () => inContext(async () => {
  const unit = createUnit()
  const out = await closeShifts(unit.view())
  await unit.commit()
  return out
})

async function night() {
  const p = await performance()
  const steward = await duty('Steward')
  const id = await shift(p.id, steward, 3)
  const [amy, ben] = [person(['front-of-house.shift.sign-up']), person(['front-of-house.shift.sign-up'])]
  const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, amy)).body.assignmentId as string
  const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ben)).body.assignmentId as string
  const row = await shiftRow(id)
  return { p, id, amy, ben, a, b, steward, callAt: row.call_at as number, endsAt: row.ends_at as number, opensAt: row.window_opens_at as number, closesAt: row.window_closes_at as number }
}

describe('FH-31: the draft report', () => {
  it('exists from the first window and takes notes by topic', async () => {
    const n = await night()
    setClock(n.opensAt - MINUTE)
    await close()
    expect(await rows('SELECT id FROM front_of_house_night_reports WHERE performance_id = ?', n.p.id)).toHaveLength(0)
    setClock(n.opensAt)
    expect((await close()).drafts).toBeGreaterThanOrEqual(1)
    expect(await rows('SELECT state FROM front_of_house_night_reports WHERE performance_id = ?', n.p.id)).toEqual([{ state: 'draft' }])
    const noted = await req('POST', `/api/front-of-house/performances/${n.p.id}/report/notes`, { topic: 'building', body: 'Lift out of order in the foyer.' }, lead())
    expect(noted.status, JSON.stringify(noted.body)).toBe(200)
    const report = (await req('GET', `/api/front-of-house/performances/${n.p.id}/report`, undefined, lead())).body
    expect(report).toMatchObject({ state: 'draft', notes: [{ kind: 'note', topic: 'building', body: 'Lift out of order in the foyer.' }] })
    expect(report.unresolved.people.map((x: any) => x.assignmentId)).toEqual([n.a, n.b])
    expect((await req('GET', `/api/front-of-house/performances/${n.p.id}/report`, undefined, person(['front-of-house.shift.sign-up']))).status).toBe(403)
  })
})

describe('FH-32: sign-off', () => {
  it('resolves people, writes a snapshot with no names, and announces it', async () => {
    const n = await night()
    setClock(n.callAt)
    await req('POST', `/api/front-of-house/performances/${n.p.id}/timings`, { kind: 'house_open' })
    const signed = await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, { noShows: [n.b] }, lead())
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    expect(await rows('SELECT id, state, minutes_worked FROM front_of_house_assignments WHERE id IN (?, ?) ORDER BY created_at', n.a, n.b)).toEqual([
      { id: n.a, state: 'worked', minutes_worked: (n.endsAt - n.callAt) / MINUTE },
      { id: n.b, state: 'no_show', minutes_worked: null },
    ])
    const [row] = await rows<{ state: string, snapshot: string }>('SELECT state, snapshot FROM front_of_house_night_reports WHERE performance_id = ?', n.p.id)
    expect(row!.state).toBe('signed_off')
    const snapshot = JSON.parse(row!.snapshot)
    expect(snapshot.duties).toEqual([{ dutyId: n.steward, duty: expect.any(String), worked: 1, noShows: 1 }])
    expect(snapshot.timings).toEqual([{ kind: 'house_open', at: n.callAt }])
    expect(row!.snapshot).not.toContain(n.amy.accountId!)
    expect(await rows('SELECT id FROM core_events WHERE name = \'front-of-house.night-report.signed-off\' AND record_id = ?', n.p.id)).toHaveLength(1)
    // Signing again is refused; someone who is not on the rota is refused as a no-show.
    expect((await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, {}, lead())).body.code).toBe('front-of-house.report-signed-off')
  })

  it('refuses a no-show who is not on tonight\'s rota', async () => {
    const n = await night()
    expect((await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, { noShows: ['asg_01JZZZZZZZZZZZZZZZZZZZZZZZ'] }, lead())).body.code).toBe('front-of-house.not-on-shift')
  })

  it('counts from check-in to check-out when the theatre asks and both exist', async () => {
    const n = await night()
    await env.DB.prepare('UPDATE front_of_house_assignments SET checked_in_at = ?, checked_out_at = ? WHERE id = ?').bind(n.callAt, n.callAt + 90 * MINUTE, n.a).run()
    await setting('front-of-house.hours.count-from', 'checked')
    try {
      await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, {}, lead())
    }
    finally {
      await setting('front-of-house.hours.count-from', 'scheduled')
    }
    expect(await rows('SELECT minutes_worked FROM front_of_house_assignments WHERE id IN (?, ?) ORDER BY created_at', n.a, n.b)).toEqual([{ minutes_worked: 90 }, { minutes_worked: (n.endsAt - n.callAt) / MINUTE }])
  })
})

describe('FH-33: after sign-off', () => {
  it('keeps the signed row as it is and takes addenda', async () => {
    const n = await night()
    await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, {}, lead())
    await expect(env.DB.prepare('UPDATE front_of_house_night_reports SET snapshot = \'{}\' WHERE performance_id = ?').bind(n.p.id).run()).rejects.toThrow(/cannot change/)
    const added = await req('POST', `/api/front-of-house/performances/${n.p.id}/report/notes`, { topic: 'staffing', body: 'Ben phoned in sick after all.' }, lead())
    expect(added.status).toBe(200)
    const report = (await req('GET', `/api/front-of-house/performances/${n.p.id}/report`, undefined, lead())).body
    expect(report.notes.map((x: any) => x.kind)).toEqual(['addendum'])
    expect(report.unresolved).toBeNull()
    // A manager corrects one person afterwards, audited.
    expect((await req('POST', `/api/front-of-house/assignments/${n.b}/outcome`, { state: 'no_show' })).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/assignments/${n.a}/outcome`, { state: 'worked', minutes: 200 })).status).toBe(200)
    expect(await rows('SELECT minutes_worked FROM front_of_house_assignments WHERE id = ?', n.a)).toEqual([{ minutes_worked: 200 }])
  })
})

describe('closing shifts', () => {
  it('completes shifts past their window and resolves people on a shift with no performance', async () => {
    const n = await night()
    const callAt = n.callAt + 30 * 24 * HOUR
    const made = await req('POST', '/api/front-of-house/shifts', { title: 'Get-out', dutyId: n.steward, places: 2, callAt, endsAt: callAt + 2 * HOUR })
    await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})
    const crew = person(['front-of-house.shift.sign-up'])
    const c = (await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/sign-up`, {}, crew)).body.assignmentId
    setClock(callAt + 5 * HOUR)
    await close()
    expect((await shiftRow(n.id)).state).toBe('completed')
    expect((await shiftRow(made.body.shiftId)).state).toBe('completed')
    expect(await rows('SELECT state, minutes_worked FROM front_of_house_assignments WHERE id = ?', c)).toEqual([{ state: 'worked', minutes_worked: 120 }])
    // People on a performance's shift wait for sign-off: no task ever marks a no-show or a worked.
    expect(await rows('SELECT state FROM front_of_house_assignments WHERE id = ?', n.a)).toEqual([{ state: 'confirmed' }])
  })
})

describe('FH-34: volunteer hours', () => {
  it('lists hours by person for a range, and exports them', async () => {
    const n = await night()
    await req('POST', `/api/front-of-house/performances/${n.p.id}/report/sign-off`, { noShows: [n.b] }, lead())
    const viewer = person(['front-of-house.hours.view'])
    const from = n.callAt - HOUR
    const to = n.callAt + HOUR
    const listed = await req('GET', `/api/front-of-house/hours?from=${from}&to=${to}`, undefined, viewer)
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: n.amy.accountId, shiftsWorked: 1, minutes: (n.endsAt - n.callAt) / MINUTE, noShows: 0 }),
      expect.objectContaining({ accountId: n.ben.accountId, shiftsWorked: 0, minutes: 0, noShows: 1 }),
    ]))
    const one = await req('GET', `/api/front-of-house/hours?from=${from}&to=${to}&accountId=${n.amy.accountId}`, undefined, viewer)
    expect(one.body.rows).toHaveLength(1)
    const csv = await call(handle, 'GET', `/api/front-of-house/hours/export?from=${from}&to=${to}`, { actor: viewer })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect((await csv.text()).split('\n')[0]).toBe('Name,Shifts worked,Hours,No-shows')
    expect((await req('GET', `/api/front-of-house/hours?from=${from}&to=${to}`, undefined, manager)).status).toBe(403)
  })
})
