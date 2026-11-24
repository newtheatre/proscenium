// CO-23 and CO-24 (part 8): a call stays inside one operating day and off the engagement's other calls in
// its space, a performance there only warns, a change once confirmed tells the contacts once per five
// minutes, and the company's contacts keep its people list until the first date starts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId, setAccessProvider, setClock } from '#kit'
import type { Actor } from '#kit'
import { call, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready } from '../../../box-office/tests/integration/stage'
import companiesPost from '../../server/api/companies/index.post'
import contactsPost from '../../server/api/companies/[id]/contacts.post'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import scheduleGet from '../../server/api/companies/engagements/[id]/schedule.get'
import callsPost from '../../server/api/companies/engagements/[id]/calls.post'
import callPatch from '../../server/api/companies/engagements/[id]/calls/[call].patch'
import callDelete from '../../server/api/companies/engagements/[id]/calls/[call].delete'
import peoplePost from '../../server/api/companies/engagements/[id]/people.post'
import personPatch from '../../server/api/companies/engagements/[id]/people/[person].patch'
import personDelete from '../../server/api/companies/engagements/[id]/people/[person].delete'

const app = server({
  'POST /api/companies': companiesPost,
  'POST /api/companies/:id/contacts': contactsPost,
  'POST /api/companies/:id/engagements': engagementsPost,
  'GET /api/companies/engagements/:id/schedule': scheduleGet,
  'POST /api/companies/engagements/:id/calls': callsPost,
  'PATCH /api/companies/engagements/:id/calls/:call': callPatch,
  'DELETE /api/companies/engagements/:id/calls/:call': callDelete,
  'POST /api/companies/engagements/:id/people': peoplePost,
  'PATCH /api/companies/engagements/:id/people/:person': personPatch,
  'DELETE /api/companies/engagements/:id/people/:person': personDelete,
})

const admin = person(['companies.company.manage', 'companies.contact.manage', 'companies.engagement.manage'])
const HOUR = 3_600_000
const DEC_1 = Date.UTC(2026, 11, 1)

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

/** A company with a signed-in contact who receives the schedule, and an engagement for a production with one performance. */
async function stage(name: string) {
  const contact = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Contact\', \'self\', 0, 0)', contact.accountId)
  const companyId = (await req(admin, 'POST', '/api/companies', { name })).body.companyId
  await req(admin, 'POST', `/api/companies/${companyId}/contacts`, { accountId: contact.accountId, receives: ['schedule'] })
  const h = await house(10, { open: false })
  const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', productionId: h.productionId })).body.engagementId
  const [performance] = await rows<{ space_id: string, starts_at: number }>('SELECT space_id, starts_at FROM core_performances WHERE id = ?', h.performanceId)
  return { contact, engagementId, spaceId: performance!.space_id, showAt: performance!.starts_at, base: `/api/companies/engagements/${engagementId}` }
}

const told = (accountId: string) => rows('SELECT id FROM core_notifications WHERE account_id = ? AND type_key = \'companies.schedule-changed\'', accountId)

beforeAll(async () => {
  setClock(NOV_16)
  await ready()
  await setModule('companies', true)
  setAccessProvider({ ...testAccess, factAbilities: async () => ({ 'companies.contact-of': ['companies.engagement.view-own', 'companies.people.manage-own'] }) })
})
afterAll(() => {
  setClock(NOV_16)
  setAccessProvider(testAccess)
})

describe('calls (CO-23, D1, D2)', () => {
  it('refuses a call across 04:00 and passes one that ends at 03:59 (call-inside-operating-day)', async () => {
    const s = await stage('Night Owls')
    const across = await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-in', spaceId: s.spaceId, startsAt: DEC_1 + 3.5 * HOUR, endsAt: DEC_1 + 5 * HOUR })
    expect(across.body.code).toBe('companies.call.crosses-day')
    const late = await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-out', spaceId: s.spaceId, startsAt: DEC_1 + 22 * HOUR, endsAt: DEC_1 + 27 * HOUR + 59 * 60_000 })
    expect(late.status).toBe(200)
    expect(late.body.warnings).toEqual([])
  })

  it('refuses an overlap in one space, allows it in none, and lets a call move within itself', async () => {
    const s = await stage('Double Booked')
    const first = (await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-in', spaceId: s.spaceId, startsAt: DEC_1 + 9 * HOUR, endsAt: DEC_1 + 12 * HOUR })).body.callId
    expect((await req(admin, 'POST', `${s.base}/calls`, { kind: 'technical', spaceId: s.spaceId, startsAt: DEC_1 + 11 * HOUR, endsAt: DEC_1 + 13 * HOUR })).body.code).toBe('companies.call.overlap')
    expect((await req(admin, 'POST', `${s.base}/calls`, { kind: 'other', label: 'Read-through', startsAt: DEC_1 + 11 * HOUR, endsAt: DEC_1 + 13 * HOUR })).status).toBe(200)
    expect((await req(admin, 'PATCH', `${s.base}/calls/${first}`, { kind: 'get-in', spaceId: s.spaceId, startsAt: DEC_1 + 10 * HOUR, endsAt: DEC_1 + 12 * HOUR })).status).toBe(200)
    expect((await req(admin, 'POST', `${s.base}/calls`, { kind: 'other', startsAt: DEC_1, endsAt: DEC_1 + HOUR })).status).toBe(422)
  })

  it('warns of a performance in the space at the same time, and saves the call anyway', async () => {
    const s = await stage('Overlapping Get-in')
    const made = await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-in', spaceId: s.spaceId, startsAt: s.showAt - HOUR, endsAt: s.showAt + HOUR })
    expect(made.status).toBe(200)
    expect(made.body.warnings).toHaveLength(1)
  })
})

describe('telling the contacts (D4)', () => {
  it('says nothing before confirmation, then once for the changes of five minutes', async () => {
    const s = await stage('Changing Times')
    const callId = (await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-in', spaceId: s.spaceId, startsAt: DEC_1 + 9 * HOUR, endsAt: DEC_1 + 10 * HOUR })).body.callId
    expect(await told(s.contact.accountId)).toHaveLength(0)
    await rows('UPDATE companies_engagements SET state = \'confirmed\' WHERE id = ?', s.engagementId)
    await req(admin, 'PATCH', `${s.base}/calls/${callId}`, { kind: 'get-in', spaceId: s.spaceId, startsAt: DEC_1 + 8 * HOUR, endsAt: DEC_1 + 10 * HOUR })
    await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-out', spaceId: s.spaceId, startsAt: DEC_1 + 22 * HOUR, endsAt: DEC_1 + 23 * HOUR })
    expect(await told(s.contact.accountId)).toHaveLength(1)
    setClock(NOV_16 + 6 * 60_000)
    expect((await req(admin, 'DELETE', `${s.base}/calls/${callId}`, {})).status).toBe(200)
    expect(await told(s.contact.accountId)).toHaveLength(2)
    setClock(NOV_16)
  })
})

describe('company people (CO-24, D3)', () => {
  it('lets a contact keep the list until the first date starts, and staff after', async () => {
    const s = await stage('Cast List')
    const added = await req(s.contact, 'POST', `${s.base}/people`, { name: 'Robin', role: 'Stage manager', under18: true })
    expect(added.status).toBe(200)
    expect((await req(s.contact, 'PATCH', `${s.base}/people/${added.body.personId}`, { name: 'Robin Hale', role: 'Stage manager', under18: true })).status).toBe(200)
    const seen = (await req(s.contact, 'GET', `${s.base}/schedule`)).body
    expect(seen).toMatchObject({ people: [{ name: 'Robin Hale', under18: true }], canManagePeople: true, canManageCalls: false, spaces: [], started: false })

    await req(admin, 'POST', `${s.base}/calls`, { kind: 'get-in', startsAt: NOV_16 - HOUR, endsAt: NOV_16 + HOUR })
    expect((await req(s.contact, 'POST', `${s.base}/people`, { name: 'Late Arrival' })).body.code).toBe('companies.people.started')
    expect((await req(s.contact, 'GET', `${s.base}/schedule`)).body).toMatchObject({ canManagePeople: false, started: true })
    expect((await req(admin, 'DELETE', `${s.base}/people/${added.body.personId}`, {})).status).toBe(200)
    expect(await rows('SELECT id FROM companies_people WHERE engagement_id = ?', s.engagementId)).toEqual([])
  })

  it('keeps someone with no tie to the company out', async () => {
    const s = await stage('Closed Door')
    const stranger = person([])
    expect((await req(stranger, 'POST', `${s.base}/people`, { name: 'Gatecrasher' })).status).toBe(403)
    expect((await req(stranger, 'GET', `${s.base}/schedule`)).status).toBe(403)
  })
})
