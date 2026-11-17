// Account merge and undo (rules X2, X3; MEM-43): where both accounts have an application open for one
// scheme, the survivor's is kept and the merged-away account's ends as superseded, with its charge
// voided; everything else moves to the survivor as it is, with the lower member number shown. Undo puts the
// superseded application back for the account it came from, unless that account opened another.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, type MergeRef, type UnitView } from '#kit'
import { env } from 'cloudflare:test'
import { inContext, rows } from '../../../../tests/integration/helpers'
import handler from '../../server/contributions/core.merge-handler/membership'
import { memberNumber } from '../../server/memberships'
import { NOV_17, applicant, ready, req, scheme } from './stage'

const run = (fn: (unit: UnitView) => unknown) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit.view())
  await unit.commit()
  return out
})

async function merge(survivorId: string, mergedAccountId: string): Promise<MergeRef> {
  const id = newId('mrg')
  await env.DB.prepare('INSERT INTO core_account_merges (id, survivor_id, merged_account_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, \'staff\', ?, ?, ?)')
    .bind(id, survivorId, mergedAccountId, survivorId, NOV_17, NOV_17 + 30 * 86_400_000).run()
  return { mergeId: id, survivorId, mergedAccountId }
}
// What the core's undo does first: the listed rows go back to the account they came from.
const moveBack = (ref: MergeRef) => rows("UPDATE membership_memberships SET account_id = ? WHERE rowid IN (SELECT CAST(row_id AS INTEGER) FROM core_account_merge_items WHERE merge_id = ? AND table_name = 'membership_memberships' AND action = 'moved') RETURNING id", ref.mergedAccountId, ref.mergeId)

async function staffChecked() {
  const id = await scheme()
  expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
  expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
  return id
}
const apply = async (schemeId: string, who: Awaited<ReturnType<typeof applicant>>) => (await req('POST', `/api/membership/schemes/${schemeId}/join`, {}, who)).body.membershipId as string
const state = async (id: string) => (await rows<{ state: string, end_reason: string | null, account_id: string }>('SELECT state, end_reason, account_id FROM membership_memberships WHERE id = ?', id))[0]!

beforeAll(ready)

describe('merging two accounts', () => {
  it('supersedes the merged-away account\'s duplicate application, moves the rest, and shows the lower number', async () => {
    const checked = await staffChecked()
    const free = await scheme()
    expect((await req('POST', `/api/membership/schemes/${free}/state`, { to: 'open' })).status).toBe(200)
    const keep = await applicant('Merge Survivor')
    const lose = await applicant('Merge Duplicate')
    const kept = await apply(checked, keep)
    const dup = await apply(checked, lose)
    const loserMember = (await req('POST', `/api/membership/schemes/${free}/join`, {}, lose)).body.membershipId as string
    const survivorMember = (await req('POST', `/api/membership/schemes/${free}/join`, {}, keep)).body.membershipId as string
    const lower = await inContext(() => memberNumber(lose.accountId!))

    const ref = await merge(keep.accountId!, lose.accountId!)
    await run(unit => handler.merge(unit, ref))
    await run(unit => handler.merge(unit, ref)) // safe to run twice
    expect(await state(dup)).toMatchObject({ state: 'ended', end_reason: 'superseded' })
    expect(await state(kept)).toMatchObject({ state: 'pending' })
    // The superseded application stays with the account it came from; the rest move.
    expect(await state(dup)).toMatchObject({ account_id: lose.accountId })
    expect(await state(loserMember)).toMatchObject({ state: 'active', account_id: keep.accountId })
    expect(await state(survivorMember)).toMatchObject({ state: 'active' })
    // Both of one scheme are kept as they are; the number shown is the lower of the two.
    await rows('UPDATE core_accounts SET merged_into_id = ? WHERE id = ? RETURNING id', keep.accountId, lose.accountId)
    expect((await inContext(() => memberNumber(keep.accountId!)))?.number).toBeLessThanOrEqual(lower!.number)

    await rows('UPDATE core_accounts SET merged_into_id = NULL WHERE id = ? RETURNING id', lose.accountId)
    // Undo: the column goes back first, then the handler restores the application.
    await moveBack(ref)
    expect(await run(unit => handler.undo!(unit, ref))).toEqual({ notRestored: 0 })
    expect(await state(dup)).toMatchObject({ state: 'pending', end_reason: null, account_id: lose.accountId })
  })

  it('leaves the application ended on undo when its account has opened another since', async () => {
    const checked = await staffChecked()
    const keep = await applicant('Undo Survivor')
    const lose = await applicant('Undo Duplicate')
    await apply(checked, keep)
    const dup = await apply(checked, lose)
    const ref = await merge(keep.accountId!, lose.accountId!)
    await run(unit => handler.merge(unit, ref))
    await moveBack(ref)
    const again = await apply(checked, lose)
    expect(again).not.toBe(dup)
    expect(await run(unit => handler.undo!(unit, ref))).toEqual({ notRestored: 1, reason: 'membership.merge.application-not-restored' })
    expect(await state(dup)).toMatchObject({ state: 'ended', end_reason: 'superseded' })
  })
})
