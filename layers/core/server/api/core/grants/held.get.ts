// Who holds what (Identity Doc part 5; ID-23, ID-24): every grant with its holder, role, reach and
// end, filtered by state, role, reach and module, and searched by the holder's name or verified
// address through findAccounts. A grant given to an account later merged away shows its survivor.
import { and, count, eq, sql } from 'drizzle-orm'
import { getQuery } from 'nuxt/server'
import { defineRoute, nowMs, readListQuery, searchWords, useDb, useSetting } from '#kit'
import { grants, roles } from '../../../db/identity'
import { findAccounts } from '../../../identity/find'
import { accountLabel } from '../../../identity/accounts'
import source, { grantStates, type GrantState } from '../../../lists/grants'
import { grantsList } from '../../../../shared/identity-lists'

const ALL: GrantState[] = ['live', 'pending', 'lapsing', 'ended']

export default defineRoute({ ability: 'core.grant.read', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const now = nowMs()
  const window = (await useSetting('core.grants.expiry-warning') as number) * 1000 // not-policy: seconds to milliseconds
  const states = (read.filters.state as GrantState[] | undefined) ?? ALL
  const where = and(
    read.where(),
    grantStates(states, now, window),
    words.length ? sql`${grants.accountId} IN (${await findAccounts(unit.view(), actor, typed, grantsList.id)})` : undefined,
  )

  const db = useDb()
  const found = await db.select({
    id: grants.id, accountId: grants.accountId, roleId: grants.roleId, role: roles.name, scope: grants.scope, scopeModule: grants.scopeModule,
    scopeType: grants.scopeType, scopeId: grants.scopeId, startsAt: grants.startsAt, expiresAt: grants.expiresAt,
    holderId: sql<string>`coalesce((SELECT h.merged_into_id FROM core_accounts h WHERE h.id = ${grants.accountId}), ${grants.accountId})`,
    claimed: sql<number>`(SELECT a.first_signed_in_at IS NOT NULL FROM core_accounts a WHERE a.id = coalesce((SELECT h.merged_into_id FROM core_accounts h WHERE h.id = ${grants.accountId}), ${grants.accountId}))`,
    endedAt: sql<number | null>`(SELECT e.ended_at FROM core_grant_ends e WHERE e.grant_id = ${grants.id})`,
  }).from(grants).innerJoin(roles, eq(roles.id, grants.roleId)).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(grants).where(where) as [{ n: number }]

  const stateOf = (g: typeof found[number]): GrantState => {
    if (g.endedAt || (g.expiresAt && g.expiresAt <= now)) return 'ended'
    if (g.startsAt > now || !g.claimed) return 'pending'
    return g.expiresAt && g.expiresAt <= now + window ? 'lapsing' : 'live'
  }
  const rows = []
  for (const g of found) {
    rows.push({
      id: g.id, accountId: g.holderId, person: await accountLabel(g.holderId), roleId: g.roleId, role: g.role,
      scope: { kind: g.scope, module: g.scopeModule, type: g.scopeType, id: g.scopeId },
      startsAt: g.startsAt, ends: g.expiresAt, endedAt: g.endedAt, state: stateOf(g),
    })
  }
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
