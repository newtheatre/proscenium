// The account scope (Foundations, Data-class registry): a read by account finds the survivor's rows
// and the rows of every account merged into it, whichever of their ids it is given, worked out
// inside the statement. And the helpers a merge handler and the merge job use to list and move rows.
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { accountScopeIds, createUnit, exactAccount, inAccountScope, moveAccountColumn, newId, recordMergeItems, useDb } from '#kit'
import { ledger } from '../fixtures/modules/seats/server/db/schema'
import { env, inContext, performance, rows } from './helpers'

async function account(mergedInto?: string): Promise<string> {
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, merged_into_id, merged_at) VALUES (?, \'Pat Person\', \'guest\', ?, ?, ?)')
    .bind(id, Date.now(), mergedInto ?? null, mergedInto ? Date.now() : null).run()
  return id
}

async function sale(performanceId: string, buyer: string): Promise<string> {
  const id = newId('sl')
  await env.DB.prepare('INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, created_at) VALUES (?, ?, 1, ?, ?)').bind(id, performanceId, buyer, Date.now()).run()
  return id
}

async function merge(survivor: string, merged: string): Promise<string> {
  const id = newId('mrg')
  await env.DB.prepare('INSERT INTO core_account_merges (id, survivor_id, merged_account_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, \'staff\', ?, ?, ?)')
    .bind(id, survivor, merged, survivor, Date.now(), Date.now() + 86_400_000).run()
  return id
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM core_account_merge_items').run()
  await env.DB.prepare('DELETE FROM core_emergency_contacts').run()
})

describe('the account scope', () => {
  it('finds the survivor\'s rows and its merged accounts\' rows, given either id, and nobody else\'s', async () => {
    const survivor = await account()
    const merged = await account(survivor)
    const stranger = await account()
    const show = await performance()
    const mine = [await sale(show, survivor), await sale(show, merged)].sort()
    await sale(show, stranger)
    const read = (who: string) => inContext(async () => (await useDb().select({ id: ledger.id }).from(ledger).where(inAccountScope(ledger.buyer, who))).map(r => r.id).sort())
    expect(await read(survivor)).toEqual(mine)
    expect(await read(merged)).toEqual(mine)
    expect(await read(stranger)).toHaveLength(1)
    // exactAccount, the escape, compares the one id.
    expect(await inContext(async () => (await useDb().select({ id: ledger.id }).from(ledger).where(exactAccount(ledger.buyer, merged))))).toHaveLength(1)
  })

  it('gives the scope\'s ids survivor first, and an id with no account stands for itself', async () => {
    const survivor = await account()
    const merged = await account(survivor)
    expect(await inContext(() => accountScopeIds(merged))).toEqual([survivor, merged])
    expect(await inContext(() => accountScopeIds(survivor))).toEqual([survivor, merged])
    expect(await inContext(() => accountScopeIds('acc_nobodynobodynobodynobodyy'))).toEqual(['acc_nobodynobodynobodynobodyy'])
  })

  it('works out the scope row by row from an SQL expression inside one set-wise statement', async () => {
    const survivor = await account()
    const merged = await account(survivor)
    const stranger = await account()
    const show = await performance()
    await sale(show, survivor)
    await sale(show, merged)
    const counts = await inContext(() => useDb().all<{ who: string, n: number }>(
      sql`SELECT j.value AS who, (SELECT count(*) FROM seats_ledger WHERE ${inAccountScope('buyer_id', sql.raw('j.value'))}) AS n FROM json_each(${JSON.stringify([merged, stranger])}) j`))
    expect(counts).toEqual([{ who: merged, n: 2 }, { who: stranger, n: 0 }])
  })
})

describe('listing and moving rows for a merge', () => {
  const contact = async (accountId: string) => {
    const id = newId('emc')
    await env.DB.prepare('INSERT INTO core_emergency_contacts (id, account_id, name, phone, updated_at) VALUES (?, ?, \'Kim Kin\', \'01234 567890\', ?)').bind(id, accountId, Date.now()).run()
    return id
  }

  it('moves a column to the survivor, listing each row first, and a second run changes nothing', async () => {
    const survivor = await account()
    const merged = await account()
    const ids = [await contact(merged), await contact(merged)]
    const mergeId = await merge(survivor, merged)
    for (let run = 0; run < 2; run++) {
      await inContext(async () => {
        const unit = createUnit()
        moveAccountColumn(unit.view(), { mergeId, table: 'core_emergency_contacts', column: 'account_id', survivorId: survivor, mergedAccountId: merged })
        await unit.commit()
      })
    }
    expect(await rows('SELECT account_id FROM core_emergency_contacts WHERE id IN (?, ?)', ...ids)).toEqual([{ account_id: survivor }, { account_id: survivor }])
    const items = await rows<{ action: string }>('SELECT action FROM core_account_merge_items WHERE merge_id = ?', mergeId)
    expect(items).toEqual([{ action: 'moved' }, { action: 'moved' }])
  })

  it('lists a row a handler sets aside, with what the close does with it', async () => {
    const survivor = await account()
    const merged = await account()
    await contact(merged)
    const mergeId = await merge(survivor, merged)
    await inContext(async () => {
      const unit = createUnit()
      recordMergeItems(unit.view(), { mergeId, table: 'core_emergency_contacts', column: 'account_id', mergedAccountId: merged, action: 'set-aside', onClose: 'keep' })
      await unit.commit()
    })
    expect(await rows('SELECT action FROM core_account_merge_items WHERE merge_id = ?', mergeId)).toEqual([{ action: 'set-aside-keep' }])
    expect(() => recordMergeItems(createUnit().view(), { mergeId, table: 'core_emergency_contacts', column: 'account_id', mergedAccountId: merged, onClose: 'keep' })).toThrow(/set-aside/)
  })
})
