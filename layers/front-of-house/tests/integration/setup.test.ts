// Setting up the rota, FH-05 to FH-08 and FH-16: duties and rota templates, applying a template to
// performances (twice adds nothing twice; a space the theatre does not manage is skipped in bulk),
// publishing, shifts not tied to a performance, changing and cancelling shifts, and following the
// performance when the core moves or cancels it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { listTerms } from '#modules/core'
import { setClock } from '#kit'
import { deliver, env, inContext, rows } from '../../../../tests/integration/helpers'
import { duty, holds, notes, performance, ready, req, shift, shiftRow, volunteer, MINUTE, NOV_16 } from './stage'

beforeAll(ready)
afterEach(() => setClock(undefined))

describe('FH-05: duties and rota templates', () => {
  it('edits and archives a duty; an archived duty takes no new shift', async () => {
    const d = await duty('Steward')
    expect((await req('PUT', `/api/front-of-house/duties/${d}`, { name: 'Head steward', callBeforeMinutes: 90, stayAfterMinutes: 15 })).status).toBe(200)
    const listed = (await req('GET', '/api/front-of-house/duties')).body.duties.find((x: any) => x.id === d)
    expect(listed).toMatchObject({ name: 'Head steward', callBeforeMinutes: 90 })
    expect((await req('POST', `/api/front-of-house/duties/${d}/archive`, {})).status).toBe(200)
    expect((await req('GET', '/api/front-of-house/duties')).body.duties.some((x: any) => x.id === d)).toBe(false)
    const p = await performance()
    expect((await req('POST', `/api/front-of-house/performances/${p.id}/shifts`, { dutyId: d, places: 1 })).body.code).toBe('front-of-house.duty-archived')
  })

  it('keeps one default template per venue', async () => {
    const d = await duty('Steward')
    const a = await req('POST', '/api/front-of-house/rota-templates', { name: 'Evening A', isDefault: true, lines: [{ dutyId: d, places: 2 }] })
    const b = await req('POST', '/api/front-of-house/rota-templates', { name: 'Evening B', isDefault: true, lines: [{ dutyId: d, places: 3 }] })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const templates = (await req('GET', '/api/front-of-house/rota-templates')).body.templates
    expect(templates.find((t: any) => t.id === a.body.templateId).isDefault).toBe(false)
    expect(templates.find((t: any) => t.id === b.body.templateId)).toMatchObject({ isDefault: true, lines: [{ dutyId: d, places: 3 }] })
    expect((await req('POST', '/api/front-of-house/rota-templates', { name: 'Twice', lines: [{ dutyId: d, places: 1 }, { dutyId: d, places: 1 }] })).body.code).toBe('front-of-house.template-duty-twice')
    expect((await req('PUT', `/api/front-of-house/rota-templates/${a.body.templateId}`, { name: 'Evening B', lines: [] })).body.code).toBe('front-of-house.template-name-taken')
    expect((await req('POST', `/api/front-of-house/rota-templates/${a.body.templateId}/archive`, {})).status).toBe(200)
  })
})

describe('FH-06: applying a rota template', () => {
  it('makes draft shifts with default times, adds nothing twice, and skips spaces the theatre does not manage', async () => {
    const steward = await duty('Steward')
    const bar = await duty('Bar')
    const template = (await req('POST', '/api/front-of-house/rota-templates', { name: 'Full house', lines: [{ dutyId: steward, places: 3 }, { dutyId: bar, places: 2 }] })).body.templateId
    const ours = await performance()
    const theirs = await performance()
    await env.DB.prepare('UPDATE core_spaces SET managed = 0 WHERE id = ?').bind(theirs.spaceId).run()
    // One shift is already there.
    await shift(ours.id, steward, 1, false)

    const applied = await req('POST', `/api/front-of-house/rota-templates/${template}/apply`, { performanceIds: [ours.id, theirs.id] })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)
    expect(applied.body.added).toEqual([{ performanceId: ours.id, shiftIds: [expect.any(String)] }])
    expect(applied.body.skipped).toEqual([{ performanceId: theirs.id, reason: 'not-managed' }])
    const made = await shiftRow(applied.body.added[0].shiftIds[0])
    expect(made).toMatchObject({ duty_id: bar, places: 2, state: 'draft', call_at: ours.startsAt - 60 * MINUTE })

    // Again: nothing new.
    const again = await req('POST', `/api/front-of-house/rota-templates/${template}/apply`, { performanceIds: [ours.id] })
    expect(again.body).toEqual({ added: [], skipped: [{ performanceId: ours.id, reason: 'nothing-new' }] })

    // From the performance's own rota, a space the theatre does not manage still takes shifts.
    const one = await req('POST', `/api/front-of-house/performances/${theirs.id}/shifts/apply`, { templateId: template })
    expect(one.body.added[0].shiftIds).toHaveLength(2)
  })
})

describe('FH-07: publishing', () => {
  it('publishes all of a performance, and takes an empty shift back to draft', async () => {
    const p = await performance()
    const a = await shift(p.id, await duty('Steward'), 2, false)
    const b = await shift(p.id, await duty('Bar'), 2, false)
    const published = await req('POST', `/api/front-of-house/performances/${p.id}/shifts/publish`, {})
    expect(published.body).toEqual({ published: 2 })
    expect((await shiftRow(a)).state).toBe('published')
    expect(await rows('SELECT id FROM core_events WHERE name = \'front-of-house.shift.published\' AND record_id IN (?, ?)', a, b)).toHaveLength(2)
    expect((await req('POST', `/api/front-of-house/shifts/${a}/unpublish`, {})).status).toBe(200)
    await req('POST', `/api/front-of-house/shifts/${b}/sign-up`, {}, volunteer())
    expect((await req('POST', `/api/front-of-house/shifts/${b}/unpublish`, {})).body.code).toBe('front-of-house.shift-has-people')
    // Bulk publish refuses whole when one is not a draft.
    expect((await req('POST', '/api/front-of-house/shifts/publish', { shiftIds: [a, b] })).body.code).toBe('front-of-house.shift-not-draft')
    expect((await shiftRow(a)).state).toBe('draft')
  })
})

describe('FH-08: a shift not tied to a performance', () => {
  it('can be signed up for and confers rostered only', async () => {
    setClock(NOV_16)
    const callAt = Date.UTC(2027, 0, 9, 10)
    const made = await req('POST', '/api/front-of-house/shifts', { title: 'Get-in', dutyId: await duty('Crew'), places: 4, callAt, endsAt: callAt + 4 * 60 * MINUTE })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})).status).toBe(200)
    const gil = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/sign-up`, {}, gil)).status).toBe(200)
    setClock(callAt)
    expect(await holds('front-of-house.rostered', gil)).toBe(true)
    expect(await holds('front-of-house.on-shift', gil)).toBe(false)
  })
})

describe('changing a shift', () => {
  it('never lowers places below those taken, and tells people of a new call time', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const hal = volunteer()
    const ian = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, hal)
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ian)
    expect((await req('PATCH', `/api/front-of-house/shifts/${id}`, { places: 1 })).body.code).toBe('front-of-house.places-below-taken')
    const callAt = p.startsAt - 120 * MINUTE
    const patched = await req('PATCH', `/api/front-of-house/shifts/${id}`, { places: 3, callAt })
    expect(patched.status, JSON.stringify(patched.body)).toBe(200)
    const row = await shiftRow(id)
    expect(row).toMatchObject({ places: 3, call_at: callAt, window_opens_at: callAt - 30 * MINUTE })
    expect(await notes('front-of-house.shift-changed', hal.accountId!)).toHaveLength(1)
  })

  it('cancels a shift, releasing everyone on it and telling them', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const jo = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, jo)
    expect((await req('POST', `/api/front-of-house/shifts/${id}/cancel`, { reason: 'Small house' })).status).toBe(200)
    expect(await shiftRow(id)).toMatchObject({ state: 'cancelled', places_taken: 0, cancelled_reason: 'Small house' })
    expect(await rows('SELECT state FROM front_of_house_assignments WHERE shift_id = ?', id)).toEqual([{ state: 'released' }])
    expect(await notes('front-of-house.shift-cancelled', jo.accountId!)).toHaveLength(1)
    expect(await holds('front-of-house.rostered', jo)).toBe(false)
  })
})

describe('FH-16: following the performance', () => {
  it('cancels every shift when the performance is cancelled, telling each person once', async () => {
    const p = await performance()
    const a = await shift(p.id, await duty('Steward'), 2)
    const b = await shift(p.id, await duty('Bar'), 2)
    const kim = volunteer()
    const lee = volunteer()
    await req('POST', `/api/front-of-house/shifts/${a}/sign-up`, {}, kim)
    await req('POST', `/api/front-of-house/shifts/${b}/sign-up`, {}, lee)
    const [illness] = (await inContext(() => listTerms('core.cancel-reason'))).filter(t => t.slug === 'illness')
    const cancelled = await req('POST', `/api/core/performances/${p.id}/cancel`, { reasonTermId: illness!.id })
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    await deliver()
    expect((await shiftRow(a)).state).toBe('cancelled')
    expect((await shiftRow(b)).state).toBe('cancelled')
    expect(await notes('front-of-house.shift-cancelled', kim.accountId!)).toHaveLength(1)
    expect(await notes('front-of-house.shift-cancelled', lee.accountId!)).toHaveLength(1)
  })

  it('tells people the new time when the performance is rescheduled', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const max = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, max)
    expect((await req('PATCH', `/api/core/performances/${p.id}`, { startsAt: p.startsAt + 60 * MINUTE, endsAt: p.endsAt + 60 * MINUTE })).status).toBe(200)
    await deliver()
    expect(await notes('front-of-house.shift-changed', max.accountId!)).toHaveLength(1)
    expect((await shiftRow(id)).call_at).toBe(p.startsAt)
  })

  it('moves the shifts to the new place and tells people', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const ned = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ned)
    const elsewhere = await req('POST', '/api/core/venues', { name: `Elsewhere ${id}` })
    const moved = await req('PATCH', `/api/core/performances/${p.id}`, { venueId: elsewhere.body.venueId, spaceId: elsewhere.body.spaceId })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    await deliver()
    expect((await shiftRow(id)).venue_id).toBe(elsewhere.body.venueId)
    expect(await notes('front-of-house.shift-moved', ned.accountId!)).toHaveLength(1)
  })
})
