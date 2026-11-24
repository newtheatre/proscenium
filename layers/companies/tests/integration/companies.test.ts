// Companies and contacts, CO-06, CO-07 and CO-09 (part 8): a near match is offered, contacts are added
// by email with one primary at most, and a company with a live engagement cannot be archived.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import type { Actor } from '#kit'
import { call, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import companiesGet from '../../server/api/companies/index.get'
import companiesPost from '../../server/api/companies/index.post'
import matchesGet from '../../server/api/companies/matches.get'
import companyGet from '../../server/api/companies/[id]/index.get'
import companyPatch from '../../server/api/companies/[id]/index.patch'
import archivePost from '../../server/api/companies/[id]/archive.post'
import restorePost from '../../server/api/companies/[id]/restore.post'
import contactsPost from '../../server/api/companies/[id]/contacts.post'
import contactPatch from '../../server/api/companies/[id]/contacts/[contact]/index.patch'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import movePost from '../../server/api/companies/engagements/[id]/[move].post'

const app = server({
  'GET /api/companies': companiesGet,
  'POST /api/companies': companiesPost,
  'GET /api/companies/matches': matchesGet,
  'GET /api/companies/:id': companyGet,
  'PATCH /api/companies/:id': companyPatch,
  'POST /api/companies/:id/archive': archivePost,
  'POST /api/companies/:id/restore': restorePost,
  'POST /api/companies/:id/contacts': contactsPost,
  'PATCH /api/companies/:id/contacts/:contact': contactPatch,
  'POST /api/companies/:id/engagements': engagementsPost,
  'POST /api/companies/engagements/:id/:move': movePost,
})

const admin = person(['companies.company.manage', 'companies.contact.manage', 'companies.engagement.manage'])
const viewer = person(['companies.company.view'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function company(name: string): Promise<string> {
  const made = await req<{ companyId: string }>(admin, 'POST', '/api/companies', { name })
  expect(made.status).toBe(200)
  return made.body.companyId
}

beforeAll(async () => {
  for (const id of ['finance', 'payments', 'companies']) await setModule(id, true)
})

describe('a near match is offered (CO-06, G1)', () => {
  it('offers "Splinter Theatre" for "The Splinter Theatre", archived ones included', async () => {
    const id = await company('Splinter Theatre')
    const found = await req(admin, 'GET', `/api/companies/matches?name=${encodeURIComponent('The Splinter-Théâtre!')}`)
    expect(found.body.matches).toEqual([{ id, name: 'Splinter Theatre', archived: false }])
    await req(admin, 'POST', `/api/companies/${id}/archive`, {})
    expect((await req(admin, 'GET', '/api/companies/matches?name=the+splinter+theatre')).body.matches).toEqual([{ id, name: 'Splinter Theatre', archived: true }])
    expect((await req(admin, 'GET', '/api/companies/matches?name=Splinter+Players')).body.matches).toEqual([])
    expect((await req(viewer, 'GET', '/api/companies/matches?name=Splinter')).status).toBe(403)
  })

  it('still adds the near match when asked, and refuses a rename onto a name in use', async () => {
    await company('Paper Lantern')
    const near = await company('The Paper Lantern')
    expect((await req(admin, 'PATCH', `/api/companies/${near}`, { name: 'paper lantern' })).body.code).toBe('companies.company.name-taken')
    expect((await req(admin, 'PATCH', `/api/companies/${near}`, { name: 'Paper Lantern Theatre', website: '' })).status).toBe(200)
    expect(await rows('SELECT name, name_key, website FROM companies_companies WHERE id = ?', near)).toEqual([{ name: 'Paper Lantern Theatre', name_key: 'paper lantern theatre', website: null }])
  })
})

describe('contacts by email (CO-07, G2, G4)', () => {
  it('makes an unclaimed account for a new address, and reuses it after', async () => {
    const id = await company('Tin Can Collective')
    const added = await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'Producer@Tincan.example', name: 'Pat Producer', role: 'Producer' })
    expect(added.status).toBe(200)
    const [contact] = await rows<{ account_id: string, is_primary: number }>('SELECT account_id, is_primary FROM companies_contacts WHERE id = ?', added.body.contactId)
    expect(contact!.is_primary).toBe(1)
    expect(await rows('SELECT name, first_signed_in_at FROM core_accounts WHERE id = ?', contact!.account_id)).toEqual([{ name: 'Pat Producer', first_signed_in_at: null }])
    expect(await rows('SELECT account_id FROM core_account_emails WHERE address = ?', 'producer@tincan.example')).toEqual([{ account_id: contact!.account_id }])

    const other = await company('Tin Can Two')
    const again = await req(admin, 'POST', `/api/companies/${other}/contacts`, { email: 'producer@tincan.example' })
    expect((await rows<{ account_id: string }>('SELECT account_id FROM companies_contacts WHERE id = ?', again.body.contactId))[0]!.account_id).toBe(contact!.account_id)
    expect((await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'producer@tincan.example' })).body.code).toBe('companies.contact.already')
  })

  it('keeps one primary at most, whoever is made primary', async () => {
    const id = await company('Two Primaries')
    const ada = (await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'ada@primaries.example', name: 'Ada' })).body.contactId
    const ben = (await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'ben@primaries.example', name: 'Ben', primary: true })).body.contactId
    const primaries = () => rows('SELECT id FROM companies_contacts WHERE company_id = ? AND is_primary = 1 AND ended_at IS NULL', id)
    expect(await primaries()).toEqual([{ id: ben }])
    expect((await req(admin, 'PATCH', `/api/companies/${id}/contacts/${ada}`, { primary: true, role: 'Company manager', receives: ['schedule', 'guests'] })).status).toBe(200)
    expect(await primaries()).toEqual([{ id: ada }])
    expect(await rows('SELECT role, receives FROM companies_contacts WHERE id = ?', ada)).toEqual([{ role: 'Company manager', receives: '["schedule","guests"]' }])
  })

  it('refuses a contact with neither an account nor an address', async () => {
    const id = await company('Nobody Yet')
    expect((await req(admin, 'POST', `/api/companies/${id}/contacts`, { role: 'Producer' })).status).toBe(422)
  })

  it('shows contacts\' addresses only to someone who manages contacts', async () => {
    const id = await company('Address Book')
    await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'cass@address.example', name: 'Cass', dayPhone: '07700 900123' })
    const full = (await req(admin, 'GET', `/api/companies/${id}`)).body
    expect(full.contacts).toEqual([expect.objectContaining({ name: 'Cass', email: 'cass@address.example', dayPhone: '07700 900123', isPrimary: true, unclaimed: true })])
    const outline = (await req(viewer, 'GET', `/api/companies/${id}`)).body
    expect(outline.contacts).toEqual([expect.objectContaining({ name: 'Cass', email: null, dayPhone: null })])
  })
})

describe('archive and restore (CO-09, G6)', () => {
  it('refuses while an engagement is live, and lists archived companies last', async () => {
    const id = await company('Aardvark Arts')
    const engagementId = (await req(admin, 'POST', `/api/companies/${id}/engagements`, { kind: 'hire', title: 'Quiz night' })).body.engagementId
    expect((await req(admin, 'POST', `/api/companies/${id}/archive`, {})).body.code).toBe('companies.company.live-engagement')
    await req(admin, 'POST', `/api/companies/engagements/${engagementId}/cancel`, { reason: 'Fell through' })
    expect((await req(admin, 'POST', `/api/companies/${id}/archive`, {})).status).toBe(200)

    const list = (await req<{ companies: { id: string, archived: boolean }[] }>(viewer, 'GET', '/api/companies')).body.companies
    const at = list.findIndex(c => c.id === id)
    expect(list[at]!.archived).toBe(true)
    expect(list.slice(at).every(c => c.archived)).toBe(true)
    expect((await req(admin, 'POST', `/api/companies/${id}/contacts`, { email: 'late@aardvark.example' })).body.code).toBe('companies.company.archived')
  })

  it('restores in one step, unless the name has been taken meanwhile', async () => {
    const id = await company('Restorable Rep')
    await req(admin, 'POST', `/api/companies/${id}/archive`, {})
    expect((await req(admin, 'POST', `/api/companies/${id}/restore`, {})).status).toBe(200)
    expect(await rows('SELECT archived_at FROM companies_companies WHERE id = ?', id)).toEqual([{ archived_at: null }])

    await req(admin, 'POST', `/api/companies/${id}/archive`, {})
    await company('restorable rep')
    expect((await req(admin, 'POST', `/api/companies/${id}/restore`, {})).body.code).toBe('companies.company.name-taken')
  })
})
