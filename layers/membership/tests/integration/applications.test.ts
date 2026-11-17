// Applications (V1 to V4, J3, J6, A1, A3): a scheme checked by staff waits in their queue until
// somebody passes or declines it; an email-domain scheme passes at once for a verified address at
// the domain; nobody checks their own; the applicant can withdraw.
import { beforeAll, describe, expect, it } from 'vitest'
import { person } from '../../../../tests/integration/helpers'
import { NOV_17, applicant, ready, req, scheme } from './stage'

beforeAll(ready)

async function checked(fields: Record<string, unknown>) {
  const id = await scheme()
  const patched = await req('PATCH', `/api/membership/schemes/${id}`, fields)
  expect(patched.status, JSON.stringify(patched.body)).toBe(200)
  const opened = await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  return id
}
const queue = async () => (await req('GET', '/api/membership/applications')).body.applications as { id: string, accountName: string, reason: string }[]

describe('a scheme checked by staff', () => {
  it('waits in the queue, returns the same application on a second try, and becomes a member when passed', async () => {
    const id = await checked({ verifier: 'membership.staff' })
    const ada = await applicant('Ada Lovelace')
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)
    expect(applied.body).toMatchObject({ pending: true, waiting: 'staff-check' })
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)).body.membershipId).toBe(applied.body.membershipId)
    expect((await req('GET', '/api/membership/mine', undefined, ada)).body).toMatchObject({ number: null, applications: [{ id: applied.body.membershipId, waiting: 'staff' }], memberships: [] })
    expect((await queue()).find(a => a.id === applied.body.membershipId)).toMatchObject({ accountName: 'Ada Lovelace', reason: 'staff-check' })

    const passed = await req('POST', `/api/membership/applications/${applied.body.membershipId}/decide`, { outcome: 'pass', note: 'Seen her card' })
    expect(passed.body, JSON.stringify(passed.body)).toMatchObject({ state: 'active', startsOn: '2026-11-17', endsOn: '2027-11-16' })
    const mine = (await req('GET', '/api/membership/mine', undefined, ada)).body
    expect(mine.memberships).toHaveLength(1)
    expect(mine.number).not.toBeNull()
    expect((await queue()).some(a => a.id === applied.body.membershipId)).toBe(false)
    expect((await req('POST', `/api/membership/applications/${applied.body.membershipId}/decide`, { outcome: 'decline' })).body.code).toBe('membership.application.changed')
  })

  it('is declined for good, and the person may apply again', async () => {
    const id = await checked({ verifier: 'membership.staff' })
    const alan = await applicant('Alan Turing')
    const first = (await req('POST', `/api/membership/schemes/${id}/join`, {}, alan)).body.membershipId
    expect((await req('POST', `/api/membership/applications/${first}/decide`, { outcome: 'decline' })).body).toEqual({ state: 'declined' })
    const again = await req('POST', `/api/membership/schemes/${id}/join`, {}, alan)
    expect(again.body.membershipId).not.toBe(first)
  })

  it('cannot be passed by the applicant, or without membership.membership.verify', async () => {
    const id = await checked({ verifier: 'membership.staff' })
    const self = await applicant('Grace Hopper')
    const officer = person(['membership.membership.verify'], { accountId: self.accountId, reassertedAt: NOV_17 })
    const membershipId = (await req('POST', `/api/membership/schemes/${id}/join`, {}, self)).body.membershipId
    expect((await req('POST', `/api/membership/applications/${membershipId}/decide`, { outcome: 'pass' }, officer)).status).toBe(403)
    expect((await req('POST', `/api/membership/applications/${membershipId}/decide`, { outcome: 'pass' }, person(['membership.membership.view']))).status).toBe(403)
  })

  it('can be withdrawn by the applicant before it is passed (J6)', async () => {
    const id = await checked({ verifier: 'membership.staff' })
    const kath = await applicant('Katherine Johnson')
    const membershipId = (await req('POST', `/api/membership/schemes/${id}/join`, {}, kath)).body.membershipId
    expect((await req('POST', `/api/membership/mine/${membershipId}/withdraw`, {}, person([]))).status).toBe(404)
    expect((await req('POST', `/api/membership/mine/${membershipId}/withdraw`, {}, kath)).body).toEqual({ state: 'ended' })
    expect((await req('GET', '/api/membership/mine', undefined, kath)).body.applications).toEqual([])
  })
})

describe('a scheme checked by email domain', () => {
  it('cannot open without a domain, and passes at once for a verified address at it', async () => {
    const id = await scheme()
    await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.email-domain' })
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).body.code).toBe('membership.scheme.needs-verifier-domains')
    await req('PATCH', `/api/membership/schemes/${id}`, { domains: ['Nottingham.ac.uk'] })
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)

    const outsider = await applicant('Outsider', 'someone@example.org')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, outsider)).body).toMatchObject({ code: 'membership.join.no-address-at-domain', reason: 'This membership is for people with an address at nottingham.ac.uk.' })
    const student = await applicant('Student', 'psxab1@nottingham.ac.uk')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, student)).body).toMatchObject({ pending: false, endsOn: '2027-11-16' })
  })
})
