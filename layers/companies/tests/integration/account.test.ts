// CO-08 (part 8): a contact added by email is told, with a claim link if they have never signed in,
// and Your companies shows their engagements with what they owe, oldest deadline first.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import type { Actor } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import companiesPost from '../../server/api/companies/index.post'
import contactsPost from '../../server/api/companies/[id]/contacts.post'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import mineGet from '../../server/api/companies/mine.get'
import mineCount from '../../server/contributions/core.count/mine'

const app = server({
  'POST /api/companies': companiesPost,
  'POST /api/companies/:id/contacts': contactsPost,
  'POST /api/companies/:id/engagements': engagementsPost,
  'GET /api/companies/mine': mineGet,
})

const admin = person(['companies.company.manage', 'companies.contact.manage', 'companies.engagement.manage'])
const NOW = Date.UTC(2026, 10, 16, 12)
const DAY = 86_400_000

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function company(name: string): Promise<string> {
  return (await req<{ companyId: string }>(admin, 'POST', '/api/companies', { name })).body.companyId
}

const sent = (accountId: string) => rows<{ type_key: string }>('SELECT type_key FROM core_notifications WHERE account_id = ? AND type_key LIKE \'companies.contact-added%\'', accountId)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'companies']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('a new contact is told (CO-08, G2)', () => {
  it('sends someone who has never signed in a claim link, and someone who has the plain message', async () => {
    const id = await company('Welcome Wagon')
    const added = await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'new.contact@wagon.example', name: 'Nell' })
    const [{ account_id: fresh }] = await rows<{ account_id: string }>('SELECT account_id FROM companies_contacts WHERE id = ?', added.body.contactId) as [{ account_id: string }]
    expect(await sent(fresh)).toEqual([{ type_key: 'companies.contact-added-claim' }])
    expect(await rows('SELECT purpose FROM core_account_tokens WHERE account_id = ?', fresh)).toEqual([{ purpose: 'claim' }])

    const known = person([])
    await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Kit\', \'self\', 0, 0)', known.accountId)
    await req(admin, 'POST', `/api/companies/${id}/contacts`, { accountId: known.accountId })
    expect(await sent(known.accountId)).toEqual([{ type_key: 'companies.contact-added' }])
  })
})

describe('Your companies (CO-08)', () => {
  it('lists a contact\'s engagements with guests to name, and counts their companies', async () => {
    const contact = person([])
    await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Mo\', \'self\', 0, 0)', contact.accountId)
    const id = await company('Mine Company')
    await req(admin, 'POST', `/api/companies/${id}/contacts`, { accountId: contact.accountId })
    const engagementId = (await req(admin, 'POST', `/api/companies/${id}/engagements`, { kind: 'hire', title: 'Quiz night' })).body.engagementId
    await rows('INSERT INTO companies_allocations (id, engagement_id, performance_id, places, named, names_due_at, created_at, updated_at) VALUES (?, ?, \'prf_x\', 4, 1, ?, 0, 0), (?, ?, \'prf_y\', 2, 2, ?, 0, 0)',
      newId('cpg'), engagementId, NOW + DAY, newId('cpg'), engagementId, NOW + 2 * DAY)

    const mine = await req(contact, 'GET', '/api/companies/mine')
    expect(mine.body.engagements).toEqual([expect.objectContaining({
      id: engagementId,
      company: 'Mine Company',
      title: 'Quiz night',
      toDo: [{ kind: 'name-guests', count: 3, due: NOW + DAY }],
    })])
    expect(await inContext(() => mineCount.value(contact))).toBe(1)
    expect((await req(person([]), 'GET', '/api/companies/mine')).body.engagements).toEqual([])
    expect(await inContext(() => mineCount.value(person([])))).toBe(0)
  })
})
