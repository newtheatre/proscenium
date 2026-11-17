// The members list and ending (tab 5, "Members" and "A membership"; tab 4, "Ending"): one row per
// membership with its status worked out from today, filtered by status and scheme, searched by
// member number; staff end one with a note; a holder ends their own only where the scheme allows.
import { beforeAll, describe, expect, it } from 'vitest'
import { person } from '../../../../tests/integration/helpers'
import { applicant, ready, req, scheme } from './stage'

beforeAll(ready)

async function open(fields: Record<string, unknown> = {}) {
  const id = await scheme(fields)
  await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  return id
}
const members = async (query: string) => (await req('GET', `/api/membership/members?${query}`)).body as { rows: { id: string, name: string, number: string | null, status: string, until: string | null }[], total: number }

describe('the members list', () => {
  it('shows current members by default, and filters by scheme and status', async () => {
    const id = await open()
    const ada = await applicant('Ada Byron')
    const joined = (await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)).body
    const added = await req('POST', `/api/membership/schemes/${id}/members`, { address: 'past@example.org', name: 'Past Member', startsOn: '2025-01-01', endsOn: '2025-12-31' })
    expect(added.status, JSON.stringify(added.body)).toBe(200)

    const current = await members(`scheme=${id}`)
    expect(current.rows.map(r => r.id)).toEqual([joined.membershipId])
    expect(current.rows[0]).toMatchObject({ name: 'Ada Byron', status: 'current', until: '2027-11-16' })
    expect(current.rows[0]!.number).toMatch(/\d+$/)
    const lapsed = await members(`scheme=${id}&status=lapsed`)
    expect(lapsed.rows.map(r => r.id)).toEqual([added.body.membershipId])
    expect((await members(`scheme=${id}&view=all`)).total).toBe(2)

    const byNumber = await members(`q=${encodeURIComponent(current.rows[0]!.number!)}&view=all`)
    expect(byNumber.rows.map(r => r.id)).toContain(joined.membershipId)
    expect((await req('GET', '/api/membership/members', undefined, person([]))).status).toBe(403)
  })
})

describe('ending a membership', () => {
  it('is done by staff with a note, stops counting at once, and cannot be done twice', async () => {
    const id = await open()
    const grace = await applicant('Grace Murray')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, grace)).body.membershipId
    expect((await req('POST', `/api/membership/memberships/${m}/end`, { note: '' })).status).toBe(422)
    expect((await req('POST', `/api/membership/memberships/${m}/end`, { note: 'Asked to leave' })).body).toEqual({ state: 'ended' })
    const detail = (await req('GET', `/api/membership/memberships/${m}`)).body
    expect(detail.membership).toMatchObject({ status: 'ended', endReason: 'by-staff', note: 'Asked to leave' })
    expect((await req('GET', '/api/membership/mine', undefined, grace)).body.memberships).toEqual([])
    expect((await req('POST', `/api/membership/memberships/${m}/end`, { note: 'Again' })).body.code).toBe('membership.membership.already-ended')
    expect((await members(`scheme=${id}&status=ended`)).rows.map(r => r.id)).toEqual([m])
  })

  it('is done by the holder only where the scheme allows it', async () => {
    const allowed = await open({ holderMayEnd: true })
    const owned = await open({ holderMayEnd: false })
    const ann = await applicant('Ann Holder')
    const a = (await req('POST', `/api/membership/schemes/${allowed}/join`, {}, ann)).body.membershipId
    const b = (await req('POST', `/api/membership/schemes/${owned}/join`, {}, ann)).body.membershipId
    expect((await req('POST', `/api/membership/mine/${a}/end`, {}, person([]))).status).toBe(404)
    expect((await req('POST', `/api/membership/mine/${b}/end`, {}, ann)).body.code).toBe('membership.end.not-by-holder')
    expect((await req('POST', `/api/membership/mine/${a}/end`, {}, ann)).body).toEqual({ state: 'ended' })
    expect((await req('GET', '/api/membership/mine', undefined, ann)).body.memberships.map((x: { id: string }) => x.id)).toEqual([b])
  })
})
