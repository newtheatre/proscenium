// Erasure (X4), expiry (J5) and the retention sweeps: erasing a person ends what they hold and keeps
// the rows for counts; list entries go when their list's date passes, kept only as a check's record.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { ERASED } from '#kit/db'
import { inContext, rows } from '../../../../tests/integration/helpers'
import { eraseAccount } from '../../../core/server/identity/erasure'
import expireApplications from '../../server/tasks/expire-applications'
import sweepLists from '../../server/tasks/sweep-lists'
import sweepMemberships from '../../server/tasks/sweep-memberships'
import { NOV_17, applicant, ready, req, scheme } from './stage'

beforeAll(ready)
afterAll(() => setClock(NOV_17))

const at = (date: string) => Date.parse(`${date}T12:00:00Z`)
const run = (task: (unit: any, context: any) => Promise<void>) => inContext(async () => {
  const unit = createUnit()
  await task(unit.view(), { dueAt: Date.now() })
  await unit.commit()
}, { kind: 'job' } as never)
const erase = (accountId: string) => inContext(async () => {
  await eraseAccount(accountId)
})

async function listScheme(file: string) {
  const made = await req('POST', '/api/membership/lists', { name: `Union ${Math.random()}`, keyKind: 'reference', referenceLabel: 'Student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
  const listId = made.body.listId as string
  expect((await req('POST', `/api/membership/lists/${listId}/import`, { file })).status).toBe(200)
  const id = await scheme()
  expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.list', listId })).status).toBe(200)
  await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  return { id, listId }
}

describe('erasure', () => {
  it('ends what each person holds, keeps the rows and numbers, and empties their list entries', async () => {
    setClock(NOV_17)
    const { id, listId } = await listScheme('30000001,2027-07-31,Ada Lovelace\n30000002,2027-07-31,Alan Turing\n30000003,2027-07-31,Grace Hopper\n')
    const ada = await applicant('Ada Lovelace')
    const alan = await applicant('Alan Turing')
    const adaJoined = (await req('POST', `/api/membership/schemes/${id}/join`, { reference: '30000001' }, ada)).body
    const alanJoined = (await req('POST', `/api/membership/schemes/${id}/join`, { reference: '30000002' }, alan)).body
    expect(adaJoined.membershipId && alanJoined.membershipId, JSON.stringify([adaJoined, alanJoined])).toBeTruthy()
    await rows('UPDATE membership_memberships SET note = ? WHERE id = ? RETURNING id', 'Paid in cash', adaJoined.membershipId)

    await erase(ada.accountId!)
    await erase(alan.accountId!)

    const held = await rows<{ state: string, end_reason: string, note: string | null, starts_on: string }>('SELECT state, end_reason, note, starts_on FROM membership_memberships WHERE id IN (?, ?) ORDER BY id', adaJoined.membershipId, alanJoined.membershipId)
    expect(held.map(h => [h.state, h.end_reason, h.starts_on])).toEqual([['ended', 'erased', '2026-11-17'], ['ended', 'erased', '2026-11-17']])
    expect(held.find(h => h.note)?.note).toBe(ERASED.redact)
    expect(await rows('SELECT number FROM membership_members WHERE account_id IN (?, ?)', ada.accountId, alan.accountId)).toHaveLength(2)
    const entries = await rows<{ key_hash: string, holder_name: string | null, used_by: string | null }>('SELECT key_hash, holder_name, used_by FROM membership_verification_entries WHERE list_id = ? ORDER BY holder_name', listId)
    expect(entries.filter(e => e.key_hash.startsWith(`${ERASED.anonymise}:`))).toHaveLength(2)
    expect(entries.filter(e => e.holder_name)).toEqual([expect.objectContaining({ holder_name: 'Grace Hopper' })])
    expect(entries.every(e => e.used_by === null)).toBe(true)
  })
})

describe('the sweeps', () => {
  it('expires an application only once its own deadline has passed', async () => {
    setClock(NOV_17)
    const id = await scheme()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const waiting = (await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Waits On Staff'))).body
    const theirs = (await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Their Turn'))).body
    expect(waiting.pending && theirs.pending, JSON.stringify(waiting)).toBe(true)
    await rows('UPDATE membership_memberships SET expires_at = ? WHERE id = ? RETURNING id', NOV_17 + 1000, theirs.membershipId)
    setClock(NOV_17 + 60_000)
    await run(expireApplications as never)
    const states = await rows<{ id: string, state: string }>('SELECT id, state FROM membership_memberships WHERE id IN (?, ?)', waiting.membershipId, theirs.membershipId)
    expect(Object.fromEntries(states.map(s => [s.id, s.state]))).toEqual({ [waiting.membershipId]: 'pending', [theirs.membershipId]: 'expired' })
  })

  it('deletes unchecked entries of a list past its date and keeps checked ones emptied', async () => {
    setClock(NOV_17)
    const { id, listId } = await listScheme('40000001,2027-07-31,Kept As Record\n40000002,2027-07-31,Never Used\n')
    const who = await applicant('Kept As Record')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { reference: '40000001' }, who)).body.membershipId).toBeTruthy()
    await rows('UPDATE membership_verification_lists SET valid_until = ? WHERE id = ? RETURNING id', '2026-12-31', listId)
    setClock(at('2027-01-02'))
    await run(sweepLists as never)
    const left = await rows<{ key_hash: string, holder_name: string | null }>('SELECT key_hash, holder_name FROM membership_verification_entries WHERE list_id = ?', listId)
    expect(left).toHaveLength(1)
    expect(left[0]!.key_hash.startsWith(`${ERASED.anonymise}:`)).toBe(true)
    expect(left[0]!.holder_name).toBeNull()
    expect((await rows<{ entry_count: number }>('SELECT entry_count FROM membership_verification_lists WHERE id = ?', listId))[0]!.entry_count).toBe(0)
    await run(sweepLists as never)
    expect(await rows('SELECT 1 FROM membership_verification_entries WHERE list_id = ?', listId)).toHaveLength(1)
  })

  it('redacts notes on memberships ended longer ago than retention, and leaves current ones', async () => {
    setClock(NOV_17)
    const id = await scheme()
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const old = (await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Long Ago'))).body.membershipId
    const current = (await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Still Here'))).body.membershipId
    await rows('UPDATE membership_memberships SET note = ? WHERE id IN (?, ?) RETURNING id', 'Staff note', old, current)
    // Lapsed on 2027-11-16; the default retention is six years.
    setClock(at('2033-11-20'))
    await rows('UPDATE membership_memberships SET ends_on = ? WHERE id = ? RETURNING id', '2034-01-01', current)
    await run(sweepMemberships as never)
    const notes = await rows<{ id: string, note: string }>('SELECT id, note FROM membership_memberships WHERE id IN (?, ?)', old, current)
    expect(Object.fromEntries(notes.map(n => [n.id, n.note]))).toEqual({ [old]: ERASED.redact, [current]: 'Staff note' })
  })
})
