// CO-04 and BO-75 (part 8, last-guest-place-once): two contacts naming the last guest place at once
// leave one guest issued complimentary tickets and the other told it has gone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId, setAccessProvider, setClock } from '#kit'
import type { Actor } from '#kit'
import { call, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, type House } from '../../../box-office/tests/integration/stage'
import guestsPost from '../../server/api/companies/allocations/[id]/guests.post'

const app = server({ 'POST /api/companies/allocations/:id/guests': guestsPost })

let h: House

async function req<T = any>(actor: Actor, path: string, body: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, 'POST', path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function account(): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', 0, 0)', who.accountId, 'Company contact')
  return who
}

/** A company with two live contacts and one allocation of `places` for the house's performance. */
async function allocation(places: number, contacts: Actor[], namesDueAt = Date.UTC(2027, 0, 1)): Promise<{ id: string, engagementId: string }> {
  h = await house(20)
  const companyId = newId('cpy')
  const engagementId = newId('cpe')
  const id = newId('cpg')
  await rows('INSERT INTO companies_companies (id, name, created_at, updated_at) VALUES (?, ?, 0, 0)', companyId, `Company ${companyId}`)
  for (const contact of contacts) await rows('INSERT INTO companies_contacts (id, company_id, account_id, created_at, updated_at) VALUES (?, ?, ?, 0, 0)', newId('cpc'), companyId, contact.accountId)
  await rows('INSERT INTO companies_engagements (id, company_id, kind, production_id, title, state, currency, created_at, updated_at) VALUES (?, ?, \'visiting\', ?, \'Guests\', \'confirmed\', \'GBP\', 0, 0)', engagementId, companyId, h.productionId)
  await rows('INSERT INTO companies_allocations (id, engagement_id, performance_id, places, names_due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)', id, engagementId, h.performanceId, places, namesDueAt)
  return { id, engagementId }
}

beforeAll(async () => {
  setClock(NOV_16)
  await ready()
  await setModule('companies', true)
  setAccessProvider({ ...testAccess, factAbilities: async () => ({ 'companies.contact-of': ['companies.engagement.view-own', 'companies.guest.name'] }) })
})
afterAll(() => setAccessProvider(testAccess))

describe('guest places (CO-04, BO-75)', () => {
  it('gives the last place to one of two contacts naming at once', async () => {
    const [ada, ben] = [await account(), await account()]
    const { id } = await allocation(1, [ada, ben])
    const [first, second] = await Promise.all([
      req(ada, `/api/companies/allocations/${id}/guests`, { name: 'Guest One', email: 'guest.one@example.org' }),
      req(ben, `/api/companies/allocations/${id}/guests`, { name: 'Guest Two', email: 'guest.two@example.org' }),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    expect([first, second].find(r => r.status === 409)!.body.code).toBe('companies.allocation.full')
    expect(await rows('SELECT places, named FROM companies_allocations WHERE id = ?', id)).toEqual([{ places: 1, named: 1 }])
    const guests = await rows<{ order_ref: string, state: string }>('SELECT order_ref, state FROM companies_guests WHERE allocation_id = ?', id)
    expect(guests).toEqual([{ order_ref: expect.stringMatching(/^ord_/), state: 'issued' }])
    expect(await rows('SELECT state, total_minor FROM box_office_orders WHERE id = ?', guests[0]!.order_ref)).toEqual([{ state: 'confirmed', total_minor: 0 }])
    expect(await rows('SELECT t.kind FROM box_office_order_lines l JOIN box_office_ticket_types t ON t.id = l.ticket_type_id WHERE l.order_id = ?', guests[0]!.order_ref)).toEqual([{ kind: 'complimentary' }])
  })

  it('refuses someone who is not a contact, and names closed at the deadline', async () => {
    const ada = await account()
    const { id } = await allocation(2, [ada], NOV_16 - 1)
    expect((await req(person([]), `/api/companies/allocations/${id}/guests`, { name: 'Guest', email: 'guest.three@example.org' })).status).toBe(403)
    expect((await req(ada, `/api/companies/allocations/${id}/guests`, { name: 'Guest', email: 'guest.three@example.org' })).body.code).toBe('companies.allocation.closed')
  })

  it('lets the box office name a guest and a plus-one, within the places', async () => {
    const box = person(['companies.allocation.manage'])
    const { id } = await allocation(2, [])
    expect((await req(box, `/api/companies/allocations/${id}/guests`, { name: 'Guest Four', email: 'guest.four@example.org', places: 3 })).body.code).toBe('companies.allocation.full')
    expect((await req(box, `/api/companies/allocations/${id}/guests`, { name: 'Guest Four', email: 'guest.four@example.org', places: 2 })).status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM box_office_order_lines WHERE order_id = (SELECT order_ref FROM companies_guests WHERE allocation_id = ?)', id)).toEqual([{ n: 2 }])
  })
})
