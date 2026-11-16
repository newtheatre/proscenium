// R-34: an account's scope, from either end of a chain of merges.
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { newId, useDb } from '#kit'
import { accountScopeIds, accountScopeIdsFor, inAccountScope } from '../../server/account-scope'
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
      const many = await accountScopeIdsFor([last, other])
      expect(many.get(last)).toEqual(expected)
      expect(many.get(other)).toEqual([other])
      for (const [id, inside] of [[survivor, true], [last, true], [other, false]] as const)
        expect(!!(await useDb().get(sql`SELECT 1 AS one WHERE ${inAccountScope(sql`${id}`, middle)}`))).toBe(inside)
    })
  })
})
