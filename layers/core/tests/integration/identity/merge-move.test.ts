// Stage two of a merge (part 4, Merge): the job core.merge-move re-points other modules' move
// columns after stage one has settled the person, runs their merge handlers first, waits on a
// handler that answers "not yet" without holding up other modules, and sets completed_at last.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NOT_YET, createUnit, inAccountScope, newId, recordMergeItems, useDb, type MergeHandler } from '#kit'
import { useRegistry } from '#kit/registry'
import { sessions } from '../../../../payments/server/db/schema'
import { Browser, deliver, env, grantDirectly, leaveIdentity, mailbox, reset, signInByEmail, staff, useIdentity } from './helpers'
import { inContext, rows, sent } from '../../../../../tests/integration/helpers'
import { restartStalledMerges } from '../../../server/identity/merge-move'
import { closeMerges } from '../../../server/identity/merge-undo'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

async function tillSession(accountId: string): Promise<string> {
  const id = newId('till')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO payments_sessions (id, point_label, opened_by, opened_at, state, float_minor, currency, created_at, updated_at) VALUES (?, \'Bar\', ?, ?, \'closed\', 0, \'GBP\', ?, ?)')
    .bind(id, accountId, at, at, at).run()
  return id
}

async function twoAccounts() {
  const admin = await staff()
  await grantDirectly(admin.accountId, ['core.account.merge'])
  const survivorId = await signInByEmail(new Browser())
  const mergedAccountId = await signInByEmail(new Browser())
  return { admin, survivorId, mergedAccountId }
}

const mergeOf = async (mergedAccountId: string) => (await rows<{ id: string, completed_at: number | null }>('SELECT id, completed_at FROM core_account_merges WHERE merged_account_id = ?', mergedAccountId))[0]!

describe('stage two of a merge', () => {
  it('moves another module\'s rows in the background; readers find them through the scope meanwhile', async () => {
    const { admin, survivorId, mergedAccountId } = await twoAccounts()
    const till = await tillSession(mergedAccountId)
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)

    // Stage one left the payments row alone, and the merge is still moving.
    expect(await rows('SELECT opened_by FROM payments_sessions WHERE id = ?', till)).toEqual([{ opened_by: mergedAccountId }])
    const merge = await mergeOf(mergedAccountId)
    expect(merge.completed_at).toBeNull()
    // A read through the account scope already finds it under the survivor.
    const found = await inContext(async () => (await useDb().select({ id: sessions.id }).from(sessions).where(inAccountScope(sessions.openedBy, survivorId))).map(r => r.id))
    expect(found).toContain(till)

    await deliver()
    expect(await rows('SELECT opened_by FROM payments_sessions WHERE id = ?', till)).toEqual([{ opened_by: survivorId }])
    expect(await rows('SELECT action FROM core_account_merge_items WHERE merge_id = ? AND table_name = \'payments_sessions\'', merge.id)).toEqual([{ action: 'moved' }])
    expect((await mergeOf(mergedAccountId)).completed_at).not.toBeNull()
  })

  describe('with a module\'s merge handler', () => {
    const answers: (typeof NOT_YET | undefined)[] = []
    const calls: string[] = []
    const handler: MergeHandler = {
      merge(unit, merge) {
        calls.push(merge.mergeId)
        const answer = answers.shift()
        if (answer === NOT_YET) return NOT_YET
        recordMergeItems(unit, { mergeId: merge.mergeId, table: 'seats_ledger', column: 'buyer_id', mergedAccountId: merge.mergedAccountId, action: 'set-aside' })
      },
    }
    let restore: () => void = () => {}

    beforeEach(() => {
      const entry = useRegistry().modules.get('seats')!
      const contributes = entry.manifest.contributes as Record<string, unknown[]> | undefined
      const before = { contributes: contributes?.['core.merge-handler'], handlers: entry.handlers.contributions?.['core.merge-handler'] }
      ;(entry.manifest as any).contributes = { ...contributes, 'core.merge-handler': [{ id: 'seats.test', file: 'test' }] }
      ;(entry.handlers as any).contributions = { ...entry.handlers.contributions, 'core.merge-handler': { test: handler } }
      restore = () => {
        ;(entry.manifest as any).contributes = { ...entry.manifest.contributes, 'core.merge-handler': before.contributes }
        ;(entry.handlers as any).contributions = { ...entry.handlers.contributions, 'core.merge-handler': before.handlers }
        if (!before.contributes) delete (entry.manifest as any).contributes['core.merge-handler']
        if (!before.handlers) delete (entry.handlers as any).contributions['core.merge-handler']
      }
      answers.length = 0
      calls.length = 0
    })
    afterEach(() => restore())

    it('a handler that answers "not yet" makes its module wait while the others carry on', async () => {
      const { admin, survivorId, mergedAccountId } = await twoAccounts()
      const till = await tillSession(mergedAccountId)
      answers.push(NOT_YET)
      expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
      expect(await deliver()).toContain('deferred')

      // Payments moved regardless; the merge is not complete while seats waits.
      expect(await rows('SELECT opened_by FROM payments_sessions WHERE id = ?', till)).toEqual([{ opened_by: survivorId }])
      const merge = await mergeOf(mergedAccountId)
      expect(merge.completed_at).toBeNull()
      expect(await rows('SELECT deferrals, last_error FROM core_jobs WHERE name = \'core.merge-move\' AND state = \'queued\'')).toEqual([{ deferrals: 1, last_error: 'deferred: core.merge.not-yet:seats' }])

      // Later the handler is ready: seats finishes and the merge completes.
      const [waiting] = await rows<{ id: string }>('SELECT id FROM core_jobs WHERE name = \'core.merge-move\' AND state = \'queued\'')
      await env.DB.prepare('UPDATE core_jobs SET run_after = 0 WHERE id = ?').bind(waiting!.id).run()
      sent.push({ jobId: waiting!.id, lane: 'prompt' })
      await deliver()
      expect(calls).toHaveLength(2)
      expect((await mergeOf(mergedAccountId)).completed_at).not.toBeNull()
    })

    it('the hourly sweep starts a merge again whose job died, and a repeat does no harm', async () => {
      const { admin, survivorId, mergedAccountId } = await twoAccounts()
      const till = await tillSession(mergedAccountId)
      expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
      // The job is lost before it runs.
      await env.DB.prepare('UPDATE core_jobs SET state = \'dead\' WHERE name = \'core.merge-move\'').run()
      await deliver()
      expect((await mergeOf(mergedAccountId)).completed_at).toBeNull()

      await env.DB.prepare('UPDATE core_account_merges SET performed_at = performed_at - 7200000 WHERE merged_account_id = ?').bind(mergedAccountId).run()
      await inContext(async () => {
        const unit = createUnit()
        await restartStalledMerges(unit.view())
        await unit.commit()
      })
      await deliver()
      expect(await rows('SELECT opened_by FROM payments_sessions WHERE id = ?', till)).toEqual([{ opened_by: survivorId }])
      expect((await mergeOf(mergedAccountId)).completed_at).not.toBeNull()
      expect(calls).toHaveLength(1)
    })
  })
})

describe('undoing a merge with two merge handlers', () => {
  const calls: string[] = []
  const handlerNamed = (name: string, notRestored = 0): MergeHandler => ({
    merge() {
      calls.push(`merge:${name}`)
    },
    undo() {
      calls.push(`undo:${name}`)
      return notRestored ? { notRestored, reason: `seats.merge.${name}-kept` } : undefined
    },
  })
  let restore: () => void = () => {}

  beforeEach(() => {
    const entry = useRegistry().modules.get('seats')!
    const before = { manifest: entry.manifest.contributes, handlers: entry.handlers.contributions }
    ;(entry.manifest as any).contributes = { ...before.manifest, 'core.merge-handler': [{ id: 'seats.first', file: 'first' }, { id: 'seats.second', file: 'second' }] }
    ;(entry.handlers as any).contributions = { ...before.handlers, 'core.merge-handler': { first: handlerNamed('first'), second: handlerNamed('second', 2) } }
    restore = () => {
      ;(entry.manifest as any).contributes = before.manifest
      ;(entry.handlers as any).contributions = before.handlers
    }
    calls.length = 0
  })
  afterEach(() => restore())

  it('runs the handlers\' undo in reverse order and records what one could not restore', async () => {
    const { admin, survivorId, mergedAccountId } = await twoAccounts()
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
    await deliver()
    expect(calls).toEqual(['merge:first', 'merge:second'])
    const merge = await mergeOf(mergedAccountId)
    expect(merge.completed_at).not.toBeNull()
    const listedOf = async () => ((await admin.browser.get('/api/core/accounts/merges')).body.merges as { id: string }[]).find(m => m.id === merge.id)
    expect(await listedOf()).toEqual(expect.objectContaining({ state: 'complete', undoable: true, waitingOn: [], notRestored: [] }))

    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).status).toBe(200)
    await deliver()
    expect(calls).toEqual(['merge:first', 'merge:second', 'undo:second', 'undo:first'])
    // The Merges screen says the merge is undone and what the module kept.
    expect(await listedOf()).toEqual(expect.objectContaining({ state: 'undone', undoable: false, notRestored: [{ handler: 'seats.second', count: 2, reason: 'seats.merge.second-kept' }] }))
    // Both people are told, at every address, that something could not be put back.
    const told = mailbox.filter(m => m.subject === 'Your accounts at The Test Theatre have been separated again')
    expect(told.length).toBeGreaterThan(0)
    const addresses = (await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id IN (?, ?) AND verified_at IS NOT NULL', survivorId, mergedAccountId)).map(r => r.address).sort()
    expect(told.map(m => m.address).sort()).toEqual(addresses)
    const notes = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE record_id = ? AND detail LIKE \'%not-restored%\'', survivorId)
    expect(notes.map(n => JSON.parse(n.detail))).toEqual([{ mergeId: merge.id, undo: 'not-restored', handler: 'seats.second', notRestored: 2, reason: 'seats.merge.second-kept' }])
    expect(await rows('SELECT merged_into_id FROM core_accounts WHERE id = ?', mergedAccountId)).toEqual([{ merged_into_id: null }])
  })
})

describe('undoing a merge, and closing it', () => {
  it('waits until the merge is complete, then puts every listed row back and parts the accounts', async () => {
    const { admin, survivorId, mergedAccountId } = await twoAccounts()
    const till = await tillSession(mergedAccountId)
    const [email] = await rows<{ id: string }>('SELECT id FROM core_account_emails WHERE account_id = ?', mergedAccountId)
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
    const merge = await mergeOf(mergedAccountId)
    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).body.code).toBe('core.merge.still-moving')

    await deliver()
    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).status).toBe(200)
    // The alias stands until the job's last unit.
    expect(await rows('SELECT merged_into_id FROM core_accounts WHERE id = ?', mergedAccountId)).toEqual([{ merged_into_id: survivorId }])
    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).body.code).toBe('core.merge.undoing')

    await deliver()
    expect(await rows('SELECT opened_by FROM payments_sessions WHERE id = ?', till)).toEqual([{ opened_by: mergedAccountId }])
    expect(await rows('SELECT account_id FROM core_account_emails WHERE id = ?', email!.id)).toEqual([{ account_id: mergedAccountId }])
    expect(await rows('SELECT merged_into_id FROM core_accounts WHERE id = ?', mergedAccountId)).toEqual([{ merged_into_id: null }])
    expect(await rows<{ undone_at: number | null }>('SELECT undone_at FROM core_account_merges WHERE id = ?', merge.id)).toEqual([{ undone_at: expect.any(Number) }])
  })

  it('gives back, as a new grant, a grant the merge ended as a duplicate', async () => {
    const { admin, survivorId, mergedAccountId } = await twoAccounts()
    const { roleId } = await grantDirectly(survivorId, ['core.role.read'])
    const { grantId } = await grantDirectly(mergedAccountId, [], { roleId })
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
    expect(await rows('SELECT ended_reason FROM core_grant_ends WHERE grant_id = ?', grantId)).toEqual([{ ended_reason: 'replaced' }])
    await deliver()
    const merge = await mergeOf(mergedAccountId)
    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).status).toBe(200)
    await deliver()
    expect(await rows('SELECT account_id FROM core_grants g WHERE role_id = ? AND NOT EXISTS (SELECT 1 FROM core_grant_ends e WHERE e.grant_id = g.id) ORDER BY account_id', roleId))
      .toEqual([survivorId, mergedAccountId].sort().map(account_id => ({ account_id })))
  })

  it('closes a complete merge once its window has passed: items go, the old account keeps only its alias', async () => {
    const { admin, survivorId, mergedAccountId } = await twoAccounts()
    await env.DB.prepare('UPDATE core_accounts SET name = \'Old Name\' WHERE id = ?').bind(mergedAccountId).run()
    await tillSession(mergedAccountId)
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })).status).toBe(200)
    await deliver()
    const merge = await mergeOf(mergedAccountId)
    await env.DB.prepare('UPDATE core_account_merges SET undo_until = 1 WHERE id = ?').bind(merge.id).run()
    await inContext(async () => {
      const unit = createUnit()
      await closeMerges(unit.view())
      await unit.commit()
    })
    expect(await rows('SELECT count(*) AS n FROM core_account_merge_items WHERE merge_id = ?', merge.id)).toEqual([{ n: 0 }])
    expect(await rows('SELECT name, merged_into_id FROM core_accounts WHERE id = ?', mergedAccountId)).toEqual([{ name: null, merged_into_id: survivorId }])
    expect((await admin.browser.post(`/api/core/accounts/merges/${merge.id}/undo`, {})).body.code).toBe('core.merge.cannot-undo')
  })
})
