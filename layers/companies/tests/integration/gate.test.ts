// The Companies gate, CO-01, CO-02 and CO-05 (part 8, the gate cases): the module's accounts, a move
// that only one of two people can make, and a contact losing access in the batch that ends them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setAccessProvider } from '#kit'
import type { Actor } from '#kit'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import createAccounts from '../../../finance/server/listeners/create-accounts'
import companiesGet from '../../server/api/companies/index.get'
import companiesPost from '../../server/api/companies/index.post'
import contactsPost from '../../server/api/companies/[id]/contacts.post'
import contactEnd from '../../server/api/companies/[id]/contacts/[contact]/end.post'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import engagementGet from '../../server/api/companies/engagements/[id]/index.get'
import movePost from '../../server/api/companies/engagements/[id]/[move].post'

const app = server({
  'GET /api/companies': companiesGet,
  'POST /api/companies': companiesPost,
  'POST /api/companies/:id/contacts': contactsPost,
  'POST /api/companies/:id/contacts/:contact/end': contactEnd,
  'POST /api/companies/:id/engagements': engagementsPost,
  'GET /api/companies/engagements/:id': engagementGet,
  'POST /api/companies/engagements/:id/:move': movePost,
})

const OWN = ['companies.engagement.view-own', 'companies.guest.name', 'companies.people.manage-own', 'companies.agreement.answer', 'companies.settlement.answer']
const admin = person(['companies.company.manage', 'companies.contact.manage', 'companies.engagement.manage'])
const other = person(['companies.engagement.manage'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function account(): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', 0, 0)', who.accountId, 'Company contact')
  return who
}

async function production(title: string): Promise<string> {
  const id = newId('prd')
  await env.DB.prepare('INSERT INTO core_productions (id, slug, title, kind, running_minutes, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, ?, \'visiting\', 90, \'draft\', 1, 1, 0, 0, 0)')
    .bind(id, id, title).run()
  return id
}

let n = 0
async function company(): Promise<string> {
  n++
  const made = await req(admin, 'POST', '/api/companies', { name: `Splinter Theatre ${n}` })
  expect(made.status).toBe(200)
  return made.body.companyId
}

beforeAll(async () => {
  for (const id of ['finance', 'payments', 'companies']) await setModule(id, true)
  setAccessProvider({ ...testAccess, factAbilities: async () => ({ 'companies.contact-of': OWN }) })
})
afterAll(() => setAccessProvider(testAccess))

describe('the module (CO-01)', () => {
  it('makes its seven locked accounts when switched on, once', async () => {
    for (let i = 0; i < 2; i++) {
      await inContext(async () => {
        const unit = createUnit()
        await createAccounts({ payload: { moduleId: 'companies' } } as any, unit.view())
        await unit.commit()
      })
    }
    const accounts = await rows<{ system_key: string, kind: string }>('SELECT system_key, kind FROM finance_accounts WHERE module = \'companies\' ORDER BY system_key')
    expect(accounts).toEqual([
      { system_key: 'companies.company-share', kind: 'expense' },
      { system_key: 'companies.deposits-held', kind: 'liability' },
      { system_key: 'companies.hire-income', kind: 'income' },
      { system_key: 'companies.other-income', kind: 'income' },
      { system_key: 'companies.paid-out', kind: 'asset' },
      { system_key: 'companies.payable', kind: 'liability' },
      { system_key: 'companies.receivable', kind: 'asset' },
    ])
  })

  it('refuses a second company of the same name, ignoring case (G1)', async () => {
    const first = await req(admin, 'POST', '/api/companies', { name: 'Lamplight Players' })
    expect(first.status).toBe(200)
    const second = await req(admin, 'POST', '/api/companies', { name: 'lamplight players' })
    expect(second.body.code).toBe('companies.company.name-taken')
  })

  it('keeps an agreement version fixed except its state (A1)', async () => {
    const companyId = await company()
    const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'hire', title: 'Birthday party' })).body.engagementId
    const id = newId('cpa')
    await rows('INSERT INTO companies_agreements (id, engagement_id, version, deal_type, hire_fee_minor, guest_names_due, settle_within, created_at) VALUES (?, ?, 1, \'hire\', 25000, \'24h\', \'14d\', 0)', id, engagementId)
    await rows('UPDATE companies_agreements SET state = \'sent\', sent_at = 1 WHERE id = ?', id)
    await expect(rows('UPDATE companies_agreements SET hire_fee_minor = 20000 WHERE id = ?', id)).rejects.toThrow(/append-only/)
    await expect(rows('DELETE FROM companies_agreements WHERE id = ?', id)).rejects.toThrow(/append-only/)
  })
})

describe('moves (CO-02)', () => {
  it('lets one of two people move an engagement from the same state, with one history row and one event', async () => {
    const companyId = await company()
    const productionId = await production('The Tempest')
    const opened = await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', productionId })
    expect(opened.status).toBe(200)
    const id = opened.body.engagementId
    await rows('UPDATE companies_engagements SET state = \'agreed\' WHERE id = ?', id)

    const [confirm, cancel] = await Promise.all([
      req(admin, 'POST', `/api/companies/engagements/${id}/confirm`, {}),
      req(other, 'POST', `/api/companies/engagements/${id}/cancel`, { reason: 'The tour fell through' }),
    ])
    expect([confirm.status, cancel.status].sort()).toEqual([200, 409])
    const [state] = await rows<{ state: string }>('SELECT state FROM companies_engagements WHERE id = ?', id)
    expect(state!.state).toBe(confirm.status === 200 ? 'confirmed' : 'cancelled')
    expect(await rows('SELECT kind, from_state, to_state FROM companies_engagement_events WHERE engagement_id = ? AND kind <> \'opened\'', id)).toEqual([
      { kind: confirm.status === 200 ? 'moved' : 'cancelled', from_state: 'agreed', to_state: state!.state },
    ])
    expect(await rows('SELECT payload FROM core_events WHERE name = \'companies.engagement.changed\' AND record_id = ?', id)).toHaveLength(2)
  })

  it('gives a production one live engagement, naming the first (E6)', async () => {
    const productionId = await production('Blood Wedding')
    const firstCompany = await company()
    expect((await req(admin, 'POST', `/api/companies/${firstCompany}/engagements`, { kind: 'visiting', productionId })).status).toBe(200)
    const second = await req(admin, 'POST', `/api/companies/${await company()}/engagements`, { kind: 'visiting', productionId })
    expect(second.body.code).toBe('companies.engagement.production-taken')
    expect(second.body.reason).toContain('Splinter Theatre')
  })

  it('refuses a move the state does not allow, and a cancel without a reason', async () => {
    const id = (await req(admin, 'POST', `/api/companies/${await company()}/engagements`, { kind: 'hire', title: 'Wedding reception' })).body.engagementId
    expect((await req(admin, 'POST', `/api/companies/engagements/${id}/confirm`, {})).body.code).toBe('companies.engagement.wrong-state')
    expect((await req(admin, 'POST', `/api/companies/engagements/${id}/cancel`, {})).body.code).toBe('companies.engagement.reason-needed')
    expect((await req(admin, 'POST', `/api/companies/engagements/${id}/settle`, {})).status).toBe(404)
  })
})

describe('the fact companies.contact-of (CO-05)', () => {
  it('ends a contact\'s access in the batch that ends them', async () => {
    const companyId = await company()
    const [ada, ben] = [await account(), await account()]
    const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', title: 'Antigone' })).body.engagementId
    const adaContact = (await req(admin, 'POST', `/api/companies/${companyId}/contacts`, { accountId: ada.accountId })).body.contactId
    await req(admin, 'POST', `/api/companies/${companyId}/contacts`, { accountId: ben.accountId, role: 'Tour manager' })

    expect((await req(ada, 'GET', `/api/companies/engagements/${engagementId}`)).body.engagement).toMatchObject({ title: 'Antigone', state: 'enquiry' })
    expect((await req(person([]), 'GET', `/api/companies/engagements/${engagementId}`)).status).toBe(403)

    expect((await req(admin, 'POST', `/api/companies/${companyId}/contacts/${adaContact}/end`, {})).body.code).toBe('companies.contact.choose-primary')
    expect((await req(admin, 'POST', `/api/companies/${companyId}/contacts/${adaContact}/end`, { primaryId: (await rows<{ id: string }>('SELECT id FROM companies_contacts WHERE account_id = ?', ben.accountId))[0]!.id })).status).toBe(200)
    expect((await req(ada, 'GET', `/api/companies/engagements/${engagementId}`)).status).toBe(403)
    expect((await req(ben, 'GET', `/api/companies/engagements/${engagementId}`)).status).toBe(200)
  })

  it('will not end the last contact of a company with a live engagement (G4)', async () => {
    const companyId = await company()
    const ada = await account()
    await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'hire', title: 'Quiz night' })
    const contactId = (await req(admin, 'POST', `/api/companies/${companyId}/contacts`, { accountId: ada.accountId })).body.contactId
    expect((await req(admin, 'POST', `/api/companies/${companyId}/contacts/${contactId}/end`, {})).body.code).toBe('companies.contact.last')
    expect((await req(ada, 'GET', `/api/companies/engagements/${(await rows<{ id: string }>('SELECT id FROM companies_engagements WHERE company_id = ?', companyId))[0]!.id}`)).status).toBe(200)
  })

  it('lists companies for those who may view them', async () => {
    const list = await req(person(['companies.company.view']), 'GET', '/api/companies')
    expect(list.body.companies.length).toBeGreaterThan(0)
    expect((await req(person([]), 'GET', '/api/companies')).status).toBe(403)
  })
})
