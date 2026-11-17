// Privacy, FH-35 and part 3's "Account merge and undo": two merged accounts on one shift, undo,
// the daily retention sweep with the longer period where a child was involved, the erasure hold
// while an incident is open, the export of reported incidents, the search and redaction of a person
// with no account, the reopen guard after sign-off, and the health checks.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock, type MergeRef } from '#kit'
import { mergeAccounts, sweep, undoMerge } from '../../server/privacy'
import hold from '../../server/contributions/core.erasure-hold/incident-open'
import exporter from '../../server/contributions/core.export-contributor/reported-incidents'
import cards from '../../server/contributions/core.health-check/emergency-cards'
import unopened from '../../server/contributions/core.health-check/incidents-unopened'
import { env, inContext, person, rows } from '../../../../tests/integration/helpers'
import { duty, performance, ready, req, setting, shift, shiftRow, MINUTE } from './stage'

beforeAll(ready)
afterEach(() => setClock(undefined))

const DAY = 24 * 60 * MINUTE
const YEAR = 365 * DAY
const run = <T>(fn: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<T>) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit.view())
  await unit.commit()
  return out
})
const reviewer = () => person(['front-of-house.incident.manage', 'front-of-house.incident.report'])
const volunteer = () => person(['front-of-house.shift.sign-up'])

async function account(name = 'Sam Steward'): Promise<string> {
  const id = newId('acc')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)').bind(id, name, at, at).run()
  return id
}

async function merge(survivorId: string, mergedAccountId: string): Promise<MergeRef> {
  const id = newId('mrg')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_account_merges (id, survivor_id, merged_account_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, \'staff\', ?, ?, ?)')
    .bind(id, survivorId, mergedAccountId, survivorId, at, at + 30 * DAY).run()
  return { mergeId: id, survivorId, mergedAccountId } as MergeRef
}

const states = (shiftId: string) => rows<{ account_id: string, state: string, freed_by_merge: string | null }>('SELECT account_id, state, freed_by_merge FROM front_of_house_assignments WHERE shift_id = ? ORDER BY account_id', shiftId)

describe('account merge', () => {
  it('keeps the assignment further along, releases the other with the merge stamp, and recounts places', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Usher'), 3)
    const [keep, lose] = [await account(), await account()]
    const k = volunteer()
    k.accountId = keep
    const l = volunteer()
    l.accountId = lose
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, l)).body.assignmentId as string
    const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, k)).body.assignmentId as string
    // The survivor's is checked in, so it wins though it is younger.
    await env.DB.prepare('UPDATE front_of_house_assignments SET state = \'checked_in\', checked_in_at = ? WHERE id = ?').bind(Date.now(), b).run()
    const ref = await merge(keep, lose)
    await run(unit => mergeAccounts(unit, ref))
    expect(await rows('SELECT id, state, freed_by_merge FROM front_of_house_assignments WHERE id IN (?, ?) ORDER BY id', a, b)).toEqual([
      { id: a, state: 'released', freed_by_merge: ref.mergeId },
      { id: b, state: 'checked_in', freed_by_merge: null },
    ].sort((x, y) => x.id < y.id ? -1 : 1))
    expect((await shiftRow(id)).places_taken).toBe(1)
    expect(await rows('SELECT action FROM core_account_merge_items WHERE merge_id = ? AND table_name = \'front_of_house_assignments\'', ref.mergeId)).toHaveLength(1)
    // Running it again changes nothing.
    await run(unit => mergeAccounts(unit, ref))
    expect((await shiftRow(id)).places_taken).toBe(1)
    expect((await states(id)).filter(s => s.state === 'released')).toHaveLength(1)
  })

  it('undo restores the released assignment when it can, and says why when it cannot', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Usher'), 2)
    const [keep, lose] = [await account(), await account()]
    const k = volunteer()
    k.accountId = keep
    const l = volunteer()
    l.accountId = lose
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, k)).body.assignmentId as string
    const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, l)).body.assignmentId as string
    const ref = await merge(keep, lose)
    await run(unit => mergeAccounts(unit, ref))
    expect((await states(id)).map(s => s.state).sort()).toEqual(['confirmed', 'released'])
    // The shift fills meanwhile.
    const c = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, volunteer())).body.assignmentId as string
    expect(await run(unit => undoMerge(unit, ref))).toEqual({ notRestored: 1, reason: 'front-of-house.shift-full' })
    // A place comes free: undo puts the merged-away account's assignment back.
    await env.DB.prepare('UPDATE front_of_house_assignments SET state = \'released\', ended_at = ? WHERE id = ?').bind(Date.now(), c).run()
    await env.DB.prepare('UPDATE front_of_house_shifts SET places_taken = 1 WHERE id = ?').bind(id).run()
    expect(await run(unit => undoMerge(unit, ref))).toEqual({ notRestored: 0 })
    expect(await rows('SELECT id, state, freed_by_merge FROM front_of_house_assignments WHERE id IN (?, ?) ORDER BY id', a, b)).toEqual(
      [{ id: a, state: 'confirmed', freed_by_merge: null }, { id: b, state: 'confirmed', freed_by_merge: null }].sort((x, y) => x.id < y.id ? -1 : 1))
    expect((await shiftRow(id)).places_taken).toBe(2)
  })

  it('does not restore once the call time has passed', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Usher'), 2)
    const [keep, lose] = [await account(), await account()]
    for (const acc of [keep, lose]) {
      const v = volunteer()
      v.accountId = acc
      await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, v)
    }
    const ref = await merge(keep, lose)
    await run(unit => mergeAccounts(unit, ref))
    setClock((await shiftRow(id)).call_at as number)
    expect(await run(unit => undoMerge(unit, ref))).toEqual({ notRestored: 1, reason: 'front-of-house.shift-begun' })
  })
})

async function incident(actor = reviewer()) {
  const made = await req('POST', '/api/front-of-house/incidents', { kind: 'incident', occurredAt: Date.now() - 10 * MINUTE, whatHappened: 'A patron slipped on the foyer stairs.' }, actor)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.incidentId as string
}

describe('retention', () => {
  it('redacts closed incidents after their period, longer where a child was involved', async () => {
    setClock(undefined)
    const r = reviewer()
    const adult = await incident(r)
    const child = await incident(r)
    await req('POST', `/api/front-of-house/incidents/${adult}/people`, { name: 'Pat Patron', contact: '07700 900123', involvement: 'affected', details: 'Grazed knee.' }, r)
    await req('POST', `/api/front-of-house/incidents/${child}/people`, { name: 'Kit Child', involvement: 'affected', isChild: true }, r)
    for (const i of [adult, child]) expect((await req('POST', `/api/front-of-house/incidents/${i}/close`, { note: 'Done.' }, r)).status).toBe(200)

    setClock(Date.now() + 8 * YEAR)
    await run(unit => sweep(unit))
    expect(await rows('SELECT what_happened, closing_note FROM front_of_house_incidents WHERE id = ?', adult)).toEqual([{ what_happened: '[removed]', closing_note: '[removed]' }])
    expect(await rows('SELECT name, contact, details FROM front_of_house_incident_people WHERE incident_id = ?', adult)).toEqual([{ name: 'Former member', contact: null, details: null }])
    expect(await rows('SELECT what_happened FROM front_of_house_incidents WHERE id = ?', child)).toEqual([{ what_happened: 'A patron slipped on the foyer stairs.' }])
    expect(await rows('SELECT body FROM front_of_house_incident_updates WHERE incident_id = ? AND body IS NOT NULL', adult)).toEqual([])

    setClock(Date.now() + 22 * YEAR)
    await run(unit => sweep(unit))
    expect(await rows('SELECT name FROM front_of_house_incident_people WHERE incident_id = ?', child)).toEqual([{ name: 'Former member' }])
    // Safe to run again.
    await run(unit => sweep(unit))
  })

  it('deletes rota history after its period but never a live assignment', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Usher'), 2)
    const v = volunteer()
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, v)).body.assignmentId as string
    const w = volunteer()
    const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, w)).body.assignmentId as string
    await env.DB.prepare('UPDATE front_of_house_assignments SET state = \'worked\', minutes_worked = 60 WHERE id = ?').bind(a).run()
    setClock(((await shiftRow(id)).ends_at as number) + 3 * YEAR)
    await run(unit => sweep(unit))
    expect(await rows('SELECT id FROM front_of_house_assignments WHERE shift_id = ?', id)).toEqual([{ id: b }])
  })
})

describe('erasure, export and people with no account', () => {
  it('holds erasure while an incident naming the account is open', async () => {
    const r = reviewer()
    const named = await account('Named Person')
    const i = await incident(r)
    expect((await req('POST', `/api/front-of-house/incidents/${i}/people`, { accountId: named, involvement: 'witness' }, r)).status).toBe(200)
    expect(await inContext(() => hold.holds(named))).toEqual(['front-of-house.retain.incident'])
    expect((await req('POST', `/api/front-of-house/incidents/${i}/close`, { note: 'Done.' }, r)).status).toBe(200)
    expect(await inContext(() => hold.holds(named))).toEqual([])
  })

  it('exports the incidents a person reported, in their own words', async () => {
    const r = reviewer()
    r.accountId = await account('Reporter')
    await incident(r)
    const parts = await inContext(() => exporter.export({ accountId: r.accountId!, emails: [] }))
    expect(parts).toHaveLength(1)
    expect(JSON.parse(parts[0]!.bytes as string)).toEqual([expect.objectContaining({ whatHappened: 'A patron slipped on the foyer stairs.', reference: expect.stringMatching(/^INC-/) })])
    expect(await inContext(() => exporter.export({ accountId: newId('acc'), emails: [] }))).toEqual([])
  })

  it('finds and redacts a person with no account, and only with the ability', async () => {
    const r = reviewer()
    const i = await incident(r)
    const marker = `Quill${newId('qu').slice(-6)}`
    await req('POST', `/api/front-of-house/incidents/${i}/people`, { name: `Jo ${marker}`, contact: 'jo@example.org', involvement: 'affected' }, r)
    const redactor = person(['front-of-house.incident.redact-person'])
    expect((await req('GET', `/api/front-of-house/incident-people?q=${marker}`, undefined, r)).status).toBe(403)
    const found = await req('GET', `/api/front-of-house/incident-people?q=${marker}`, undefined, redactor)
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people).toEqual([expect.objectContaining({ incidentId: i, name: `Jo ${marker}`, contact: 'jo@example.org' })])
    const redacted = await req('POST', `/api/front-of-house/incident-people/${found.body.people[0].personId}/redact`, {}, redactor)
    expect(redacted.status, JSON.stringify(redacted.body)).toBe(200)
    expect(await rows('SELECT name, contact FROM front_of_house_incident_people WHERE incident_id = ?', i)).toEqual([{ name: 'Former member', contact: null }])
    expect((await req('GET', `/api/front-of-house/incident-people?q=${marker}`, undefined, redactor)).body.people).toEqual([])
  })
})

describe('health checks', () => {
  it('warns of an unopened incident past the review window', async () => {
    await setting('front-of-house.incidents.review-within', 3600)
    await incident()
    setClock(Date.now() + 2 * 60 * MINUTE)
    expect((await inContext(() => unopened.check())).state).toBe('warning')
  })

  it('warns of a venue with a coming performance and no reviewed emergency card', async () => {
    const p = await performance()
    setClock(p.startsAt - DAY)
    const out = await inContext(() => cards.check())
    expect(out.state).toBe('warning')
    expect(out.sentence).toContain('Front of house venue')
    expect((await req('PUT', `/api/front-of-house/emergency-cards/${p.venueId}`, { body: 'Exits: foyer doors and stage left.', reviewed: true })).status).toBe(200)
    expect((await inContext(() => cards.check())).sentence).not.toContain(`venue ${p.venueId}`)
  })
})
