// Verification lists (MEM-20, MEM-57, MEM-58; V4, V10, V11, V15, V18, V19, D9): a students' union's
// file of student IDs, end dates and names. Loaded without keeping the IDs, checked one at a time,
// joined against at once, and typed at the checkout for the member price.
import { beforeAll, describe, expect, it } from 'vitest'
import { first, requirements } from '#kit'
import { inContext, person } from '../../../../tests/integration/helpers'
import { ready, req, scheme } from './stage'

beforeAll(ready)

const FILE = 'Student ID,Ends,Name\n20123456,31/07/2027,Ada Lovelace\n20654321,2027-07-31,Alan Turing\n123,2027-07-31,Too Short\n20123456,2027-07-31,Twice\n20999999,soon,Bad Date\n'

async function makeList(file = FILE) {
  const made = await req('POST', '/api/membership/lists', { name: 'Union 2026–27', keyKind: 'reference', referenceLabel: 'NNT member? Enter your University of Nottingham student ID', referenceNoun: 'student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const id = made.body.listId as string
  expect((await req('POST', `/api/membership/lists/${id}/import`, { file })).status).toBe(200)
  return id
}
async function listScheme(fields: Record<string, unknown> = {}, lengths?: number[]) {
  const listId = await makeList()
  const id = await scheme(fields, lengths)
  expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.list', listId })).status).toBe(200)
  const opened = await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  return { id, listId }
}
const check = (listId: string, value: string) => req('POST', `/api/membership/lists/${listId}/check`, { value })

describe('a verification list', () => {
  it('loads a file after a dry run, keeping no ID, and says which lines it left out', async () => {
    const made = await req('POST', '/api/membership/lists', { name: 'Dry', keyKind: 'reference', referenceLabel: 'NNT member? Enter your University of Nottingham student ID', referenceNoun: 'student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
    const id = made.body.listId
    const dry = await req('POST', `/api/membership/lists/${id}/import`, { file: FILE, dryRun: true })
    expect(dry.body).toMatchObject({ loaded: 0, wouldLoad: 2 })
    expect(dry.body.refused.map((r: { reason: string }) => r.reason)).toEqual(['not-well-formed', 'repeated', 'bad-date'])
    expect((await req('GET', `/api/membership/lists/${id}`)).body.list.entryCount).toBe(0)
    await req('POST', `/api/membership/lists/${id}/import`, { file: FILE })
    expect((await req('GET', `/api/membership/lists/${id}`)).body.list.entryCount).toBe(2)
    const stored = await inContext(() => first<{ n: number }>('SELECT count(*) AS n FROM membership_verification_entries WHERE list_id = ? AND key_hash LIKE \'%20123456%\'', id))
    expect(stored!.n).toBe(0)
  })

  it('checks one reference, adds and removes one by hand, and a new file keeps unchanged entries', async () => {
    const id = await makeList()
    expect((await check(id, '20123456')).body).toMatchObject({ found: true, current: true, endsOn: '2027-07-31', name: 'Ada Lovelace' })
    expect((await check(id, '20000000')).body).toEqual({ found: false })
    expect((await req('POST', `/api/membership/lists/${id}/entries`, { value: '20000000', endsOn: '2026-12-31', name: 'Grace Hopper' })).status).toBe(200)
    expect((await check(id, ' 2000 0000 ')).body).toMatchObject({ found: true, name: 'Grace Hopper' })
    expect((await req('POST', `/api/membership/lists/${id}/entries`, { value: '123' })).body.code).toBe('membership.list.not-well-formed')
    expect((await req('POST', `/api/membership/lists/${id}/entries/remove`, { value: '20000000' })).status).toBe(200)
    expect((await check(id, '20000000')).body).toEqual({ found: false })
    expect((await req('POST', `/api/membership/lists/${id}/entries/remove`, { value: '20000000' })).body.code).toBe('membership.list.not-found')

    const before = await inContext(() => first<{ id: string }>('SELECT id FROM membership_verification_entries WHERE list_id = ? AND holder_name = ?', id, 'Alan Turing'))
    await req('POST', `/api/membership/lists/${id}/import`, { file: '20654321,2028-07-31,Alan M. Turing\n' })
    const after = await inContext(() => first<{ id: string }>('SELECT id FROM membership_verification_entries WHERE list_id = ? AND holder_name = ?', id, 'Alan M. Turing'))
    expect(after!.id).toBe(before!.id)
    expect((await check(id, '20123456')).body).toEqual({ found: false })
    expect((await req('GET', `/api/membership/lists/${id}`)).body.list.entryCount).toBe(1)
  })

  it('needs a short noun for a reference list, used in sentences in place of the question', async () => {
    const missing = await req('POST', '/api/membership/lists', { name: 'No noun', keyKind: 'reference', referenceLabel: 'NNT member? Enter your University of Nottingham student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
    expect(missing.body).toMatchObject({ code: 'membership.list.noun-needed', fields: { referenceNoun: 'membership.list.noun-needed' } })
    const id = await makeList()
    expect((await req('PATCH', `/api/membership/lists/${id}`, { referenceNoun: 'union number' })).status).toBe(200)
    expect((await req('GET', `/api/membership/lists/${id}`)).body.list).toMatchObject({ referenceNoun: 'union number', referenceLabel: 'NNT member? Enter your University of Nottingham student ID' })
    expect((await req('PATCH', `/api/membership/lists/${id}`, { referenceNoun: null })).body.code).toBe('membership.list.noun-needed')
  })

  it('is managed only with membership.verification-list.manage', async () => {
    const id = await makeList()
    expect((await req('POST', `/api/membership/lists/${id}/import`, { file: FILE }, person(['membership.verification-list.check']))).status).toBe(403)
    expect((await check(id, '20123456')).status).toBe(200)
    expect((await req('POST', `/api/membership/lists/${id}/check`, { value: '20123456' }, person(['membership.verification-list.check']))).status).toBe(200)
  })
})

describe('joining against a list', () => {
  it('joins at once with a student ID on the list, ending when the list says (D9), and claims the entry (V4)', async () => {
    const { id } = await listScheme()
    const student = person([])
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, student)).body.code).toBe('membership.join.needs-reference')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { reference: '123' }, student)).body).toMatchObject({ code: 'membership.join.not-well-formed', reason: 'Your student ID should be 8 digits.' })
    // The list's question is the field's label; sentences use its short noun (finding: never splice the question in).
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, student)).body.reason).toBe('Type your student ID.')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20000000' }, student)).body).toMatchObject({ code: 'membership.join.not-on-list', reason: 'We could not find a current membership with that student ID. Have a membership? Contact us.' })
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20123456' }, student)
    expect(joined.body, JSON.stringify(joined.body)).toMatchObject({ startsOn: '2026-11-17', endsOn: '2027-07-31', opensMembersArea: true })
    const row = await inContext(() => first<{ length_option_id: string | null, used: string | null, outcome: string }>(
      'SELECT m.length_option_id, e.used_by AS used, v.outcome FROM membership_memberships m JOIN membership_verifications v ON v.membership_id = m.id JOIN membership_verification_entries e ON e.id = v.entry_id WHERE m.id = ?',
      joined.body.membershipId,
    ))
    expect(row).toEqual({ length_option_id: null, used: joined.body.membershipId, outcome: 'passed' })
    // V4: a second account typing the same ID waits for staff, who see the list's name for it.
    const other = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20123456' }, person([]))
    expect(other.body).toMatchObject({ pending: true, waiting: 'entry-already-used' })
  })

  it('asks for no length where the list sets the end date (D9)', async () => {
    const { id } = await listScheme({}, [12, 36])
    const offered = (await req('GET', '/api/membership/schemes', undefined, person([]))).body.schemes.find((s: { id: string }) => s.id === id)
    expect(offered.endsByList).toBe(true)
    expect((await req('GET', `/api/membership/schemes/${id}`)).body.endsByList).toBe(true)
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20654321' }, person([]))
    expect(joined.body, JSON.stringify(joined.body)).toMatchObject({ endsOn: '2027-07-31', pending: false })
  })

  it('lets staff add a member with a student ID, checking and claiming the entry', async () => {
    const { id } = await listScheme()
    const add = (body: Record<string, unknown>) => req('POST', `/api/membership/schemes/${id}/members`, { address: `ada${Math.random().toString(36).slice(2)}@example.org`, ...body })
    expect((await add({ reference: '123' })).body.code).toBe('membership.join.not-well-formed')
    expect((await add({ reference: '20000000' })).body.code).toBe('membership.join.not-on-list')
    const added = await add({ reference: '20123456' })
    expect(added.body, JSON.stringify(added.body)).toMatchObject({ endsOn: '2027-07-31' })
    const row = await inContext(() => first<{ used: string | null, outcome: string }>(
      'SELECT e.used_by AS used, v.outcome FROM membership_verifications v JOIN membership_verification_entries e ON e.id = v.entry_id WHERE v.membership_id = ?', added.body.membershipId))
    expect(row).toEqual({ used: added.body.membershipId, outcome: 'passed' })
    expect((await add({ reference: '20123456' })).body.code).toBe('membership.join.entry-already-used')
    // Without a reference nothing is checked, as before.
    expect((await add({})).status).toBe(200)
  })

  it('cannot open until the scheme has a list', async () => {
    const id = await scheme()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.list' })).body.code).toBe('membership.scheme.list-needed')
  })
})

describe('the member price by student ID', () => {
  it('is met by a typed student ID with the entry as evidence, and by account with the same evidence once claimed (V11)', async () => {
    const { id, listId } = await listScheme({ acceptsReference: true })
    const ref = `membership:${id}`
    const buyer = person([])
    const typed = (value: string) => inContext(() => requirements.check({ accounts: [null], refs: [ref], presented: [{ ref, value }], whenUnavailable: 'not-met' }), buyer)
    const entry = await inContext(() => first<{ id: string }>('SELECT id FROM membership_verification_entries WHERE list_id = ? AND holder_name = ?', listId, 'Ada Lovelace'))

    const [unclaimed] = await typed('20123456')
    expect(unclaimed).toMatchObject({ verdict: 'met', evidence: entry!.id })
    expect(unclaimed).not.toHaveProperty('holderAccountId')
    expect((await typed('12'))[0]).toMatchObject({ verdict: 'not-met', reason: 'Your student ID should be 8 digits.' })
    expect((await typed('20000000'))[0]!.verdict).toBe('not-met')

    const student = person([])
    await req('POST', `/api/membership/schemes/${id}/join`, { reference: '20123456' }, student)
    const [byAccount] = await inContext(() => requirements.check({ accounts: [student.accountId!], refs: [ref], whenUnavailable: 'not-met' }), student)
    expect(byAccount).toMatchObject({ verdict: 'met', evidence: entry!.id })
    expect((await inContext(() => requirements.check({ accounts: [null], refs: [ref], presented: [{ ref, evidence: entry!.id }], whenUnavailable: 'not-met' }), buyer))[0]!.verdict).toBe('met')

    const described = await inContext(() => requirements.describe([ref]), buyer)
    expect(described[ref]!.presentable).toMatchObject({ label: `${described[ref]!.label}: type your student ID or member number to get this price`, field: 'NNT member? Enter your University of Nottingham student ID' })

    const door = person(['membership.verification-list.check'])
    expect(await inContext(() => requirements.holder(ref, entry!.id), door)).toBe('Ada Lovelace')
    await expect(inContext(() => requirements.holder(ref, entry!.id), buyer)).rejects.toThrow('core.access.denied')
  })
})
