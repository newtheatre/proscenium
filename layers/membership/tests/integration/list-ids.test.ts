// Student IDs the union's file has not caught up with (Matt, 2026-11-17): somebody whose ID is not
// on the list can ask the theatre to check it, staff passing it can add it to the list, and an ID
// staff added stays through file loads until a file holds it too.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { first } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext } from '../../../../tests/integration/helpers'
import { applicant, ready, req, scheme } from './stage'

beforeAll(ready)
beforeEach(() => resetRateLimits())

const FILE = 'Student ID,Ends,Name\n20123456,2027-07-31,Ada Lovelace\n'
async function listScheme() {
  const made = await req('POST', '/api/membership/lists', { name: 'Union', keyKind: 'reference', referenceLabel: 'Your student ID', referenceNoun: 'student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
  const listId = made.body.listId as string
  expect((await req('POST', `/api/membership/lists/${listId}/import`, { file: FILE })).status).toBe(200)
  const id = await scheme()
  expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.list', listId })).status).toBe(200)
  expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
  return { id, listId }
}
const check = (listId: string, value: string) => req('POST', `/api/membership/lists/${listId}/check`, { value })
const entry = (listId: string) => inContext(() => first<{ by_hand: number, ends_on: string | null, used_by: string | null, holder_name: string | null }>('SELECT by_hand, ends_on, used_by, holder_name FROM membership_verification_entries WHERE list_id = ? AND by_hand = 1', listId))

describe('an ID not on the list', () => {
  it('is refused, then waits for staff when the person asks, and passing it adds it to the list', async () => {
    const { id, listId } = await listScheme()
    const bea = await applicant('Bea Missing')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20777777' }, bea)).body.code).toBe('membership.join.not-on-list')
    // A typing mistake is still refused, even when asking.
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { reference: '2077', askStaff: true }, bea)).body.code).toBe('membership.join.not-well-formed')
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '2077 7777', askStaff: true }, bea)
    expect(applied.body).toMatchObject({ pending: true, waiting: 'not-on-list' })
    const queued = (await req('GET', '/api/membership/applications')).body.applications.find((a: { id: string }) => a.id === applied.body.membershipId)
    expect(queued).toMatchObject({ reason: 'not-on-list', reference: '20777777' })

    const passed = await req('POST', `/api/membership/applications/${applied.body.membershipId}/decide`, { outcome: 'pass', addToList: true })
    expect(passed.body, JSON.stringify(passed.body)).toMatchObject({ state: 'active', endsOn: '2027-11-16' })
    expect(await entry(listId)).toEqual({ by_hand: 1, ends_on: '2027-11-16', used_by: applied.body.membershipId, holder_name: 'Bea Missing' })
    expect(queued).toMatchObject({ startsNow: true, endsOn: '2027-11-16' })
    expect((await check(listId, '20777777')).body).toMatchObject({ found: true })
    expect((await req('GET', `/api/membership/lists/${listId}`)).body).toMatchObject({ byHand: 1, list: { entryCount: 2 } })

    // A new file without it keeps it; one with it makes it the file's.
    expect((await req('POST', `/api/membership/lists/${listId}/import`, { file: FILE })).status).toBe(200)
    expect((await check(listId, '20777777')).body).toMatchObject({ found: true })
    expect((await req('GET', `/api/membership/lists/${listId}`)).body).toMatchObject({ byHand: 1, list: { entryCount: 2 } })
    expect((await req('POST', `/api/membership/lists/${listId}/import`, { file: `${FILE}20777777,2028-07-31,Bea Missing\n` })).status).toBe(200)
    expect(await entry(listId)).toBeNull()
    expect((await check(listId, '20777777')).body).toMatchObject({ found: true, endsOn: '2028-07-31' })
    expect((await req('GET', `/api/membership/lists/${listId}`)).body.byHand).toBe(0)
  })

  it('is left off the list when staff untick it, and an entry added by hand survives a reload', async () => {
    const { id, listId } = await listScheme()
    const cal = await applicant('Cal Unticked')
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20888888', askStaff: true }, cal)
    expect((await req('POST', `/api/membership/applications/${applied.body.membershipId}/decide`, { outcome: 'pass', addToList: false })).body.state).toBe('active')
    expect((await check(listId, '20888888')).body).toEqual({ found: false })

    expect((await req('POST', `/api/membership/lists/${listId}/entries`, { value: '20999999', name: 'Di Hand' })).status).toBe(200)
    expect((await req('POST', `/api/membership/lists/${listId}/import`, { file: FILE })).status).toBe(200)
    expect((await check(listId, '20999999')).body).toMatchObject({ found: true, name: 'Di Hand' })
  })

  it('ends on the day staff set when they pass it, and the entry added with it ends then too', async () => {
    const { id, listId } = await listScheme()
    const eve = await applicant('Eve Dated')
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20666666', askStaff: true }, eve)
    const decide = (body: Record<string, unknown>) => req('POST', `/api/membership/applications/${applied.body.membershipId}/decide`, { outcome: 'pass', addToList: true, ...body })
    const { today } = (await req('GET', '/api/membership/applications')).body
    const refused = await decide({ endsOn: today })
    expect(refused.body).toMatchObject({ code: 'membership.application.ends-before-start', fields: { endsOn: 'membership.application.ends-before-start' } })
    expect((await decide({ endsOn: '2027-07-31' })).body).toMatchObject({ state: 'active', endsOn: '2027-07-31' })
    expect(await entry(listId)).toMatchObject({ ends_on: '2027-07-31', used_by: applied.body.membershipId })
  })
})
