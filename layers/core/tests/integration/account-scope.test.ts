// R-34: an account's scope, from either end of a chain of merges.
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { newId, useDb } from '#kit'
import { accountScopeIds, inAccountScope } from '../../server/account-scope'
import { env, inContext } from '../../../../tests/integration/helpers'

async function account(mergedInto: string | null = null): Promise<string> {
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, merged_into_id) VALUES (?, \'Pat\', \'guest\', ?, ?)').bind(id, Date.now(), mergedInto).run()
  return id
}

describe('the account scope', () => {
  it('is the same set from the survivor or from any account merged into it', async () => {
    const survivor = await account()
    const middle = await account(survivor)
    const last = await account(middle)
    const other = await account()
    await inContext(async () => {
      const expected = [survivor, ...[middle].sort(), last]
      expect(await accountScopeIds(survivor)).toEqual(expected)
      expect(await accountScopeIds(last)).toEqual(expected)
      expect(await accountScopeIds(other)).toEqual([other])
      // Set-wise: each row's own scope, with the account given as an expression.
      const rows = await useDb().all<{ asked: string, id: string }>(sql`SELECT r.value AS asked, a.id FROM json_each(${JSON.stringify([last, other])}) r
        JOIN core_accounts a ON ${inAccountScope(sql`a.id`, sql`r.value`)} ORDER BY r.value, a.id`)
      expect(rows.filter(r => r.asked === last).map(r => r.id)).toEqual([...expected].sort())
      expect(rows.filter(r => r.asked === other).map(r => r.id)).toEqual([other])
      for (const [id, inside] of [[survivor, true], [last, true], [other, false]] as const)
        expect(!!(await useDb().get(sql`SELECT 1 AS one WHERE ${inAccountScope(sql`${id}`, middle)}`))).toBe(inside)
    })
  })
})
