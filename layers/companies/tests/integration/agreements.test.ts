// CO-18, CO-19, CO-21 and CO-22 (part 8): a version's terms follow its deal type and are sent to the
// contacts who receive agreements; a contact answers once; a paper answer is recorded by someone other
// than its author; new terms are a new version, and accepting one makes or changes the guest places.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId, setAccessProvider, setClock } from '#kit'
import type { Actor } from '#kit'
import { call, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready } from '../../../box-office/tests/integration/stage'
import companiesPost from '../../server/api/companies/index.post'
import contactsPost from '../../server/api/companies/[id]/contacts.post'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import draftPost from '../../server/api/companies/engagements/[id]/agreements.post'
import versionsGet from '../../server/api/companies/engagements/[id]/agreements.get'
import sendPost from '../../server/api/companies/engagements/[id]/agreements/[agreement]/send.post'
import withdrawPost from '../../server/api/companies/engagements/[id]/agreements/[agreement]/withdraw.post'
import answerPost from '../../server/api/companies/engagements/[id]/agreements/[agreement]/answer.post'
import recordPost from '../../server/api/companies/agreements/[id]/record.post'

const app = server({
  'POST /api/companies': companiesPost,
  'POST /api/companies/:id/contacts': contactsPost,
  'POST /api/companies/:id/engagements': engagementsPost,
  'POST /api/companies/engagements/:id/agreements': draftPost,
  'GET /api/companies/engagements/:id/agreements': versionsGet,
  'POST /api/companies/engagements/:id/agreements/:agreement/send': sendPost,
  'POST /api/companies/engagements/:id/agreements/:agreement/withdraw': withdrawPost,
  'POST /api/companies/engagements/:id/agreements/:agreement/answer': answerPost,
  'POST /api/companies/agreements/:id/record': recordPost,
})

const admin = person(['companies.company.manage', 'companies.contact.manage', 'companies.engagement.manage', 'companies.agreement.manage'])
const recorder = person(['companies.agreement.record'])
const SPLIT = { dealType: 'split', companyShareBp: 7000, shareBasis: 'net-of-fees', guestPlaces: 2, guestNamesDue: '24h' }

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

/** A company with a signed-in contact who receives agreements, and an engagement for a production with one performance to come. */
async function stage(name: string, receives = ['agreement']) {
  const contact = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Contact\', \'self\', 0, 0)', contact.accountId)
  const companyId = (await req(admin, 'POST', '/api/companies', { name })).body.companyId
  await req(admin, 'POST', `/api/companies/${companyId}/contacts`, { accountId: contact.accountId, receives })
  const h = await house(10, { open: false })
  const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', productionId: h.productionId })).body.engagementId
  const base = `/api/companies/engagements/${engagementId}/agreements`
  return { contact, engagementId, h, base, state: async () => (await rows<{ state: string }>('SELECT state FROM companies_engagements WHERE id = ?', engagementId))[0]!.state }
}

beforeAll(async () => {
  setClock(NOV_16)
  await ready()
  await setModule('companies', true)
  setAccessProvider({ ...testAccess, factAbilities: async () => ({ 'companies.contact-of': ['companies.engagement.view-own', 'companies.guest.name', 'companies.agreement.answer'] }) })
})
afterAll(() => setAccessProvider(testAccess))

describe('drafting and sending (CO-18, A2)', () => {
  it('refuses a split without its share, and a send with nobody to receive it', async () => {
    const s = await stage('Half Terms')
    const bare = (await req(admin, 'POST', s.base, { dealType: 'split' })).body.agreementId
    expect((await req(admin, 'POST', `${s.base}/${bare}/send`, {})).body.code).toBe('companies.agreement.terms-missing')
    const quiet = await stage('Nobody Listens', ['schedule'])
    const ok = (await req(admin, 'POST', quiet.base, SPLIT)).body.agreementId
    expect((await req(admin, 'POST', `${quiet.base}/${ok}/send`, {})).body.code).toBe('companies.agreement.no-recipient')
  })

  it('sends, moving the enquiry to offered and telling the contact', async () => {
    const s = await stage('Sent Along')
    const id = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    expect((await req(admin, 'POST', `${s.base}/${id}/send`, {})).status).toBe(200)
    expect(await s.state()).toBe('offered')
    expect(await rows('SELECT type_key FROM core_notifications WHERE account_id = ? AND type_key = \'companies.agreement-sent\'', s.contact.accountId)).toHaveLength(1)
    expect(await rows('SELECT guest_names_due, settle_within FROM companies_agreements WHERE id = ?', id)).toEqual([{ guest_names_due: '1d', settle_within: '14d' }])
  })
})

describe('answering (CO-19, A3, A4)', () => {
  it('accepts once, moving to agreed and holding guest places for each performance to come', async () => {
    const s = await stage('Yes Please')
    const id = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    await req(admin, 'POST', `${s.base}/${id}/send`, {})
    const [first, second] = await Promise.all([
      req(s.contact, 'POST', `${s.base}/${id}/answer`, { answer: 'accepted' }),
      req(s.contact, 'POST', `${s.base}/${id}/answer`, { answer: 'declined' }),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    const answer = (first.status === 200 ? first : second).body.answer
    expect(await rows('SELECT answer FROM companies_agreement_responses WHERE agreement_id = ?', id)).toEqual([{ answer }])
    if (answer === 'declined') return expect(await s.state()).toBe('enquiry')
    expect(await s.state()).toBe('agreed')
    const [starts] = await rows<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', s.h.performanceId)
    expect(await rows('SELECT performance_id, places, names_due_at, state FROM companies_allocations WHERE engagement_id = ?', s.engagementId))
      .toEqual([{ performance_id: s.h.performanceId, places: 2, names_due_at: starts!.starts_at - 86_400_000, state: 'open' }])
  })

  it('refuses someone who is not a contact, and moves a decline back to enquiry', async () => {
    const s = await stage('No Thanks')
    const id = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    await req(admin, 'POST', `${s.base}/${id}/send`, {})
    expect((await req(person([]), 'POST', `${s.base}/${id}/answer`, { answer: 'accepted' })).status).toBe(403)
    expect((await req(s.contact, 'POST', `${s.base}/${id}/answer`, { answer: 'declined' })).status).toBe(200)
    expect(await s.state()).toBe('enquiry')
    const seen = (await req(s.contact, 'GET', s.base)).body
    expect(seen).toMatchObject({ canAnswer: true, canManage: false, versions: [{ state: 'declined', answer: 'declined', responder: 'Contact' }] })
  })
})

describe('paper answers and new versions (CO-21, CO-22, A5, A6)', () => {
  it('records a paper answer by someone other than the author, for a live contact', async () => {
    const s = await stage('On Paper')
    const id = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    await req(admin, 'POST', `${s.base}/${id}/send`, {})
    const author = person(['companies.agreement.record'], { accountId: admin.accountId })
    expect((await req(author, 'POST', `/api/companies/agreements/${id}/record`, { answer: 'accepted', responderId: s.contact.accountId })).status).toBe(403)
    expect((await req(recorder, 'POST', `/api/companies/agreements/${id}/record`, { answer: 'accepted', responderId: recorder.accountId })).body.code).toBe('companies.agreement.not-a-contact')
    expect((await req(recorder, 'POST', `/api/companies/agreements/${id}/record`, { answer: 'accepted', responderId: s.contact.accountId })).status).toBe(200)
    expect(await rows('SELECT responder_id, recorded_by FROM companies_agreement_responses WHERE agreement_id = ?', id)).toEqual([{ responder_id: s.contact.accountId, recorded_by: recorder.accountId }])
  })

  it('keeps the accepted version until the next is accepted, and never cuts places below those named', async () => {
    const s = await stage('Second Thoughts')
    const v1 = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    await req(admin, 'POST', `${s.base}/${v1}/send`, {})
    await req(s.contact, 'POST', `${s.base}/${v1}/answer`, { answer: 'accepted' })
    await rows('UPDATE companies_allocations SET named = 2 WHERE engagement_id = ?', s.engagementId)

    const v2 = (await req(admin, 'POST', s.base, { ...SPLIT, guestPlaces: 1 })).body.agreementId
    const states = () => rows('SELECT version, state FROM companies_agreements WHERE engagement_id = ? ORDER BY version', s.engagementId)
    expect(await states()).toEqual([{ version: 1, state: 'accepted' }, { version: 2, state: 'draft' }])
    await req(admin, 'POST', `${s.base}/${v2}/send`, {})
    expect(await s.state()).toBe('agreed')
    await req(s.contact, 'POST', `${s.base}/${v2}/answer`, { answer: 'accepted' })
    expect(await states()).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'accepted' }])
    expect(await rows('SELECT places, named FROM companies_allocations WHERE engagement_id = ?', s.engagementId)).toEqual([{ places: 2, named: 2 }])
  })

  it('withdraws a sent version until it is answered, back to enquiry', async () => {
    const s = await stage('Take It Back')
    const id = (await req(admin, 'POST', s.base, SPLIT)).body.agreementId
    await req(admin, 'POST', `${s.base}/${id}/send`, {})
    expect((await req(admin, 'POST', `${s.base}/${id}/withdraw`, {})).status).toBe(200)
    expect(await s.state()).toBe('enquiry')
    expect((await req(s.contact, 'POST', `${s.base}/${id}/answer`, { answer: 'accepted' })).body.code).toBe('companies.agreement.wrong-state')
  })
})
