// Exporting the members list (MEM-27) and correcting a membership's dates (D7, MEM-28): the export
// is the view on screen as a CSV file, privileged and audited; staff change the dates of a running
// membership with a note, never their own, never past the start or into its renewal.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { call, person, rows } from '../../../../tests/integration/helpers'
import { NOV_17, applicant, handle, ready, req, scheme } from './stage'

beforeAll(ready)
afterAll(() => setClock(NOV_17))

const exporter = person(['membership.membership.export'], { reassertedAt: NOV_17 })
const editor = person(['membership.membership.update'], { reassertedAt: NOV_17 })

async function open(fields: Record<string, unknown> = {}) {
  const id = await scheme(fields)
  await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  return id
}

describe('exporting the members list', () => {
  it('gives the view as CSV to holders of the export ability, and audits it', async () => {
    const id = await open()
    const ada = await applicant('=Ada Formula')
    const joined = (await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)).body
    expect((await req('GET', '/api/membership/members/access', undefined, exporter)).body).toEqual({ canExport: true })
    expect((await req('GET', '/api/membership/members/access')).body).toEqual({ canExport: false })
    expect((await call(handle, 'GET', `/api/membership/members/export?scheme=${id}`, { actor: person(['membership.membership.view']) })).status).toBe(403)

    const csv = await call(handle, 'GET', `/api/membership/members/export?scheme=${id}`, { actor: exporter })
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const lines = (await csv.text()).trim().split('\n')
    expect(lines[0]).toBe('Name,Member number,Scheme,Status,Until,Joined')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^'=Ada Formula,[^,]*\d,Scheme \d+,current,2027-11-16,2026-11-17$/)
    const audit = await rows<{ action: string }>("SELECT action FROM core_audit WHERE action = 'export' AND actor_account_id = ?", exporter.accountId)
    expect(audit).toHaveLength(1)
    expect(joined.membershipId).toBeTruthy()
  })
})

describe('changing a membership\'s dates', () => {
  it('corrects a running membership with a note, and refuses what does not fit', async () => {
    const id = await open()
    const who = await applicant('Date Change')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const post = (body: Record<string, unknown>, actor = editor) => req('POST', `/api/membership/memberships/${m}/dates`, body, actor)

    expect((await post({ startsOn: '2026-09-01', endsOn: '2027-08-31', note: 'Union records' }, person([]))).status).toBe(403)
    expect((await post({ startsOn: '2026-09-01', endsOn: '2027-08-31', note: 'Mine' }, person(['membership.membership.update'], { accountId: who.accountId } as never))).status).toBe(403)
    expect((await post({ startsOn: '2026-09-01', endsOn: '2027-08-31', note: '' })).status).toBe(422)
    expect((await post({ startsOn: '2027-09-01', endsOn: '2027-08-31', note: 'Backwards' })).body.code).toBe('membership.dates.out-of-order')
    expect((await post({ startsOn: '2026-09-01', endsOn: null, note: 'Forever' })).body.code).toBe('membership.dates.needs-end')

    const changed = await post({ startsOn: '2026-09-01', endsOn: '2027-08-31', note: 'Union records' })
    expect(changed.body, JSON.stringify(changed.body)).toEqual({ startsOn: '2026-09-01', endsOn: '2027-08-31' })
    const detail = (await req('GET', `/api/membership/memberships/${m}`, undefined, editor)).body
    expect(detail.membership).toMatchObject({ startsOn: '2026-09-01', endsOn: '2027-08-31', note: 'Union records' })
    expect(detail.canChangeDates).toBe(true)
    expect((await req('GET', `/api/membership/memberships/${m}`)).body.canChangeDates).toBe(false)
    const [audit] = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE record_type = 'membership.membership' AND record_id = ? AND action = 'update'", m)
    expect(JSON.parse(audit!.detail)).toMatchObject({ fromStartsOn: '2026-11-17', fromEndsOn: '2027-11-16', toStartsOn: '2026-09-01', toEndsOn: '2027-08-31' })

    await req('POST', `/api/membership/memberships/${m}/end`, { note: 'Left' })
    expect((await post({ startsOn: '2026-09-01', endsOn: '2027-09-30', note: 'Too late' })).body.code).toBe('membership.dates.not-active')
  })

  it('may not reach into the membership that renews it', async () => {
    const id = await open({ renewalOpensDays: 30 })
    const who = await applicant('Renewed Early')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    setClock(Date.parse('2027-10-20T12:00:00Z'))
    const renewed = await req('POST', `/api/membership/mine/${m}/renew`, {}, who)
    expect(renewed.body, JSON.stringify(renewed.body)).toMatchObject({ startsOn: '2027-11-17' })
    const overlap = await req('POST', `/api/membership/memberships/${m}/dates`, { startsOn: '2026-11-17', endsOn: '2027-12-31', note: 'Longer' }, editor)
    expect(overlap.body.code).toBe('membership.dates.overlaps-renewal')
    expect((await req('POST', `/api/membership/memberships/${m}/dates`, { startsOn: '2026-11-17', endsOn: '2027-10-31', note: 'Shorter' }, editor)).status).toBe(200)
  })
})
