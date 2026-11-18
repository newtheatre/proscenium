// Incidents, FH-27 to FH-30: reporting with numbers and severity at report; the reporter's limited
// view; routing at once or in the daily digest, with no detail in any message; review with category,
// severity, people (welfare details sealed) and actions; closing rules; reopening; chasing actions.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setAccessProvider, setClock } from '#kit'
import { listTerms } from '#modules/core'
import { chaseActions, sendDigest } from '../../server/incidents'
import myReportsCount from '../../server/contributions/core.count/my-reports'
import { env, inContext, person, rows, testAccess } from '../../../../tests/integration/helpers'
import { notes, ready, req, setting } from './stage'

// holdersOf asks the access provider for each candidate's grants: these accounts hold incident.manage.
const reviewers = new Set<string>()
beforeAll(async () => {
  await ready()
  setAccessProvider({ ...testAccess, grants: async actor => (actor.accountId && reviewers.has(actor.accountId) ? [{ ability: 'front-of-house.incident.manage', via: 'role' }] : actor.grants ?? []) as never })
})
afterAll(() => setAccessProvider(testAccess))
afterEach(() => setClock(undefined))

const MINUTE = 60_000
const reporter = () => person(['front-of-house.incident.report'])
const reviewer = () => person(['front-of-house.incident.manage', 'front-of-house.incident.report'])
const run = <T>(fn: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<T>) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit.view())
  await unit.commit()
  return out
})

/** A real account holding incident.manage, so holdersOf finds it. */
async function realReviewer(): Promise<string> {
  const accountId = newId('acc')
  const roleId = newId('rol')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Rhea Reviewer\', \'self\', ?, ?)').bind(accountId, at, at).run()
  await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, \'Welfare\', 0, 1, 0, \'none\', ?)').bind(roleId, `welfare-${roleId.slice(-8)}`, at).run()
  await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, \'front-of-house.incident.manage\')').bind(roleId).run()
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, \'acc_testgranter\', ?)').bind(newId('gra'), accountId, roleId, at - 1000, at - 1000).run()
  reviewers.add(accountId)
  return accountId
}

async function report(actor = reporter(), extra: Record<string, unknown> = {}) {
  const made = await req('POST', '/api/front-of-house/incidents', { kind: 'incident', occurredAt: Date.now() - 10 * MINUTE, whatHappened: 'A patron slipped on the foyer stairs.', whereNote: 'Foyer stairs', ...extra }, actor)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body as { incidentId: string, reference: string, severity: string }
}

const term = async (vocabulary: string, slug: string) => (await inContext(() => listTerms(vocabulary))).find(t => t.slug === slug)!.id

describe('FH-27: reporting', () => {
  it('numbers each report in the year and sets the severity at report', async () => {
    const a = await report()
    const b = await report(reporter(), { firstAidGiven: true })
    const c = await report(reporter(), { kind: 'near_miss', serious: true })
    expect(a.reference).toMatch(/^INC-\d{4}-\d{4}$/)
    const n = (ref: string) => Number(ref.slice(-4))
    expect([n(b.reference) - n(a.reference), n(c.reference) - n(b.reference)]).toEqual([1, 1])
    expect([a.severity, b.severity, c.severity]).toEqual(['minor', 'moderate', 'serious'])
    expect((await req('POST', '/api/front-of-house/incidents', { kind: 'incident', occurredAt: Date.now() + 60 * MINUTE, whatHappened: 'Later' }, reporter())).body.code).toBe('front-of-house.incident-in-future')
  })

  it('shows the reporter their own reports in limited form, and nothing of anyone else\'s', async () => {
    const amy = reporter()
    const mine = await report(amy)
    await report(reporter())
    const listed = (await req('GET', '/api/front-of-house/incidents/mine', undefined, amy)).body.incidents
    expect(listed).toEqual([{ id: mine.incidentId, reference: mine.reference, kind: 'incident', state: 'reported', occurredAt: expect.any(Number), whatHappened: 'A patron slipped on the foyer stairs.', people: [] }])
    expect((await req('GET', `/api/front-of-house/incidents/${mine.incidentId}`, undefined, amy)).status).toBe(403)
    expect((await req('GET', '/api/front-of-house/incidents', undefined, amy)).status).toBe(403)
    // My reports appears in the members' area once there is one to show.
    expect(await inContext(() => myReportsCount.value(amy))).toBe(1)
    expect(await inContext(() => myReportsCount.value(reporter()))).toBe(0)
  })
})

describe('IN-1: who was involved', () => {
  async function account(name: string): Promise<string> {
    const id = newId('acc')
    const at = Date.now()
    await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)').bind(id, name, at, at).run()
    return id
  }

  it('stores the people the reporter names, and shows them to the reviewer and in My reports', async () => {
    const amy = reporter()
    const usher = await account('Wendell Usherwood')
    const made = await report(amy, { people: [
      { accountId: usher, involvement: 'helped' },
      { name: 'A patron in row F', contact: '07700 900123', involvement: 'affected' },
    ] })
    const read = (await req('GET', `/api/front-of-house/incidents/${made.incidentId}`, undefined, reviewer())).body
    expect(read.people.map((p: any) => ({ accountId: p.accountId, name: p.name, contact: p.contact, involvement: p.involvement, fromReport: p.fromReport }))).toEqual([
      { accountId: usher, name: 'Wendell Usherwood', contact: null, involvement: 'helped', fromReport: true },
      { accountId: null, name: 'A patron in row F', contact: '07700 900123', involvement: 'affected', fromReport: true },
    ])
    const mine = (await req('GET', '/api/front-of-house/incidents/mine', undefined, amy)).body.incidents
    expect(mine[0].people).toEqual([{ name: 'Wendell Usherwood', involvement: 'helped' }, { name: 'A patron in row F', involvement: 'affected' }])

    // Someone a reviewer adds later is not the reporter's to see.
    const added = await req('POST', `/api/front-of-house/incidents/${made.incidentId}/people`, { name: 'Another patron', involvement: 'witness' }, reviewer())
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    expect((await req('GET', '/api/front-of-house/incidents/mine', undefined, amy)).body.incidents[0].people).toHaveLength(2)
    const again = (await req('GET', `/api/front-of-house/incidents/${made.incidentId}`, undefined, reviewer())).body
    expect(again.people.find((p: any) => p.name === 'Another patron').fromReport).toBe(false)
  })

  it('refuses someone with neither an account nor a name, or an account that is not there, and keeps no report', async () => {
    const amy = reporter()
    const unnamed = await req('POST', '/api/front-of-house/incidents', { kind: 'incident', occurredAt: Date.now() - MINUTE, whatHappened: 'Unnamed', people: [{ involvement: 'witness' }] }, amy)
    expect(unnamed.status).toBe(422)
    const ghost = await req('POST', '/api/front-of-house/incidents', { kind: 'incident', occurredAt: Date.now() - MINUTE, whatHappened: 'Ghost', people: [{ accountId: newId('acc'), involvement: 'witness' }] }, amy)
    expect(ghost.body.code).toBe('front-of-house.unknown-person')
    expect((await req('GET', '/api/front-of-house/incidents/mine', undefined, amy)).body.incidents).toEqual([])
  })

  it('lets a reporter find people on the system by name, and nobody else', async () => {
    await account('Ottoline Findable')
    const found = await req('GET', '/api/front-of-house/incidents/people?q=Ottoline', undefined, reporter())
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people.map((p: any) => p.label)).toContain('Ottoline Findable')
    expect(JSON.stringify(found.body)).not.toContain('@')
    expect((await req('GET', '/api/front-of-house/incidents/people?q=Ottoline', undefined, person([]))).status).toBe(403)
  })
})

describe('the reviewers\' list', () => {
  it('shows those awaiting review by default, finds one by its number, and holds no free text', async () => {
    const a = await report()
    const listed = await req('GET', '/api/front-of-house/incidents', undefined, reviewer())
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body.rows.find((r: any) => r.id === a.incidentId)).toEqual({ id: a.incidentId, reference: a.reference, kind: 'incident', severity: 'minor', state: 'reported', occurred: expect.any(Number), venue: null, actions: 0 })
    expect(JSON.stringify(listed.body)).not.toContain('slipped')
    const found = (await req('GET', `/api/front-of-house/incidents?q=${a.reference}&view=all`, undefined, reviewer())).body
    expect(found.rows.map((r: any) => r.id)).toEqual([a.incidentId])
    expect((await req('GET', '/api/front-of-house/incidents?q=nothing-like-a-number', undefined, reviewer())).body.total).toBe(0)
    expect((await req('GET', '/api/front-of-house/incidents?state=closed', undefined, reviewer())).body.rows.find((r: any) => r.id === a.incidentId)).toBeUndefined()
  })
})

describe('FH-28: routing', () => {
  it('tells reviewers at once of a serious incident, and of the rest in the morning digest, with no detail', async () => {
    const rhea = await realReviewer()
    const serious = await report(reporter(), { serious: true, whatHappened: 'Secret words about a fall.' })
    const now = await rows<{ payload: string }>('SELECT payload FROM core_notifications WHERE type_key = \'front-of-house.incident-reported\' AND account_id = ?', rhea)
    expect(now).toHaveLength(1)
    expect(JSON.stringify(now)).toContain(serious.reference)
    expect(JSON.stringify(now)).not.toContain('Secret words')

    const minor = await report(reporter(), { whatHappened: 'Quiet words about a spill.' })
    expect(await rows('SELECT id FROM core_notifications WHERE type_key = \'front-of-house.incident-reported\' AND account_id = ?', rhea)).toHaveLength(1)
    expect(await run(unit => sendDigest(unit))).toBeGreaterThanOrEqual(1)
    const digest = await rows<{ payload: string }>('SELECT payload FROM core_notifications WHERE type_key = \'front-of-house.incident-digest\' AND account_id = ?', rhea)
    expect(digest).toHaveLength(1)
    expect(JSON.stringify(digest)).toContain(minor.reference)
    expect(JSON.stringify(digest)).not.toContain(serious.reference)
    expect(JSON.stringify(digest)).not.toContain('Quiet words')
    // Run again: nothing new to send.
    expect(await run(unit => sendDigest(unit))).toBe(0)
  })

  it('sends moderate ones at once when the theatre lowers the threshold', async () => {
    const rhea = await realReviewer()
    await setting('front-of-house.incidents.immediate-severity', 'moderate')
    try {
      await report(reporter(), { emergencyServicesCalled: true })
      expect(await notes('front-of-house.incident-reported', rhea)).toHaveLength(1)
    }
    finally {
      await setting('front-of-house.incidents.immediate-severity', 'serious')
    }
  })
})

describe('FH-29: review', () => {
  it('opens for review, sets the category and severity, and logs each change', async () => {
    const r = reviewer()
    const made = await report(reporter(), { firstAidGiven: true })
    const path = `/api/front-of-house/incidents/${made.incidentId}`
    expect((await req('POST', `${path}/open`, {}, r)).status).toBe(200)
    expect((await req('POST', `${path}/review`, { severity: 'minor' }, r)).body.code).toBe('front-of-house.severity-floor')
    const reviewed = await req('POST', `${path}/review`, { categoryId: await term('front-of-house.incident-category', 'slip-or-fall'), severity: 'serious', comment: 'Spoke to the house manager.' }, r)
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200)
    const read = (await req('GET', path, undefined, r)).body
    expect(read).toMatchObject({ state: 'in_review', severity: 'serious', categoryId: expect.any(String) })
    expect(read.updates.map((u: any) => u.kind)).toEqual(['state', 'category', 'severity', 'comment'])
    // A term from another vocabulary is refused.
    expect((await req('POST', `${path}/review`, { categoryId: await term('front-of-house.exception-reason', 'broken') }, r)).body.code).toBe('front-of-house.unknown-category')
  })

  it('records people with or without an account, with welfare details sealed', async () => {
    const r = reviewer()
    const made = await report()
    const path = `/api/front-of-house/incidents/${made.incidentId}/people`
    expect((await req('POST', path, { involvement: 'affected' }, r)).body.code).toBe('front-of-house.person-unnamed')
    const guest = await req('POST', path, { name: 'Pat Patron', contact: '07700 900123', involvement: 'affected', details: 'Grazed knee; plaster applied.' }, r)
    expect(guest.status, JSON.stringify(guest.body)).toBe(200)
    const member = reporter()
    await req('POST', path, { accountId: member.accountId, involvement: 'witness' }, r)
    const [stored] = await rows<{ details: string }>('SELECT details FROM front_of_house_incident_people WHERE id = ?', guest.body.personId)
    expect(stored!.details).not.toContain('Grazed')
    const read = (await req('GET', `/api/front-of-house/incidents/${made.incidentId}`, undefined, r)).body
    expect(read.people).toEqual([
      expect.objectContaining({ name: 'Pat Patron', contact: '07700 900123', involvement: 'affected', details: 'Grazed knee; plaster applied.' }),
      expect.objectContaining({ accountId: member.accountId, involvement: 'witness', details: null }),
    ])
    expect((await req('PUT', `${path}/${guest.body.personId}`, { name: 'Pat Patron', involvement: 'affected', isChild: true }, r)).status).toBe(200)
    expect((await req('POST', `${path}/${guest.body.personId}/remove`, {}, r)).status).toBe(200)
    // Reading under incident.view is audited.
    expect((await rows('SELECT id FROM core_audit WHERE record_id = ? AND action = \'read\'', made.incidentId)).length).toBeGreaterThanOrEqual(1)
  })

  it('chases an action the day before it is due, once', async () => {
    const r = reviewer()
    const owner = await realReviewer()
    const made = await report()
    const due = new Date(Date.now() + 24 * 60 * MINUTE).toISOString().slice(0, 10)
    const added = await req('POST', `/api/front-of-house/incidents/${made.incidentId}/actions`, { what: 'Replace the stair nosing', ownerId: owner, dueOn: due }, r)
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    expect(await run(unit => chaseActions(unit))).toBeGreaterThanOrEqual(1)
    expect(await notes('front-of-house.action-due', owner)).toHaveLength(1)
    await run(unit => chaseActions(unit))
    expect(await notes('front-of-house.action-due', owner)).toHaveLength(1)
  })
})

describe('FH-30: closing', () => {
  it('needs every action resolved, and a second person for a serious incident', async () => {
    const rose = reviewer()
    const made = await report(rose, { serious: true })
    const path = `/api/front-of-house/incidents/${made.incidentId}`
    const action = (await req('POST', `${path}/actions`, { what: 'Check the handrail' }, rose)).body.actionId
    expect((await req('POST', `${path}/close`, { note: 'Done' }, reviewer())).body.code).toBe('front-of-house.incident-actions-open')
    expect((await req('POST', `${path}/actions/${action}/resolve`, { state: 'dropped' }, rose)).body.code).toBe('front-of-house.drop-reason')
    expect((await req('POST', `${path}/actions/${action}/resolve`, { state: 'dropped', note: 'Handrail replaced last week' }, rose)).status).toBe(200)
    expect((await req('POST', `${path}/close`, { note: 'Done' }, rose)).body.code).toBe('front-of-house.incident-needs-second-person')
    const closed = await req('POST', `${path}/close`, { note: 'Reviewed with the venue.' }, reviewer())
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(await rows('SELECT id FROM core_events WHERE name = \'front-of-house.incident.closed\' AND record_id = ?', made.incidentId)).toHaveLength(1)
    expect((await req('POST', `${path}/review`, { comment: 'Late thought' }, rose)).body.code).toBe('front-of-house.incident-closed')
    expect((await req('POST', `${path}/reopen`, { reason: 'New information from the venue.' }, rose)).status).toBe(200)
    const read = (await req('GET', path, undefined, rose)).body
    expect(read.state).toBe('in_review')
    expect(read.updates.at(-1)).toMatchObject({ kind: 'state', from: 'closed', to: 'in_review' })
  })

  it('lets the reporter close a minor incident they also review', async () => {
    const rose = reviewer()
    const made = await report(rose)
    expect((await req('POST', `/api/front-of-house/incidents/${made.incidentId}/close`, { note: 'Mopped up.' }, rose)).status).toBe(200)
  })
})
