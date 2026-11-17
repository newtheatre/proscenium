// The console's Accounts list (Identity Doc part 5): everyone, searched by name, the name they go by
// and their verified addresses through findAccounts, filtered by state. Unclaimed and erased
// accounts are hidden unless looked for, and the answer says how many the search left out so the
// page can offer them. A merged-away account is never a row of its own: its survivor is.
import { and, count, isNull, sql, type SQL } from 'drizzle-orm'
import { getQuery } from 'h3'
import { defineRoute, readListQuery, searchWords, useDb } from '#kit'
import { accounts } from '../../db/identity'
import { findAccounts } from '../../identity/find'
import source, { accountState } from '../../lists/accounts'
import { accountsList } from '../../../shared/identity-lists'

const HIDDEN = ['unclaimed', 'anonymised'] as const

export default defineRoute({ ability: 'core.account.read', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  // The search runs through findAccounts, so a verified address finds its person as it does on any
  // other list; readList reads everything else in the address.
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const searched = words.length ? sql`${accounts.id} IN (${await findAccounts(unit.view(), actor, typed, accountsList.id)})` : undefined
  const living = isNull(accounts.mergedIntoId)
  const where = and(living, read.where(), searched)

  const db = useDb()
  const found = await db.select({
    id: accounts.id, name: accounts.name, preferredName: accounts.preferredName, since: accounts.createdAt,
    firstSignedInAt: accounts.firstSignedInAt, disabledAt: accounts.disabledAt, anonymisedAt: accounts.anonymisedAt,
  }).from(accounts).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(accounts).where(where) as [{ n: number }]

  // What the state filter left out, under the same search, for "3 not yet signed in are hidden".
  const shown = new Set((read.filters.state as string[] | undefined) ?? HIDDEN)
  const hidden: Partial<Record<typeof HIDDEN[number], number>> = {}
  for (const state of HIDDEN) {
    if (shown.has(state)) continue
    const stateWhere = source.bound.filters.state!.where!([state]) as SQL
    const [{ n }] = await db.select({ n: count() }).from(accounts).where(and(living, stateWhere, searched)) as [{ n: number }]
    if (n) hidden[state] = n
  }

  unit.audit({ action: 'read', ability: 'core.account.read', detail: { list: accountsList.id } })
  return {
    rows: found.map(r => ({ id: r.id, name: r.name, preferredName: r.preferredName, since: r.since, state: accountState(r) })),
    total,
    dropped: read.dropped,
    ignoredWords,
    searchTooShort,
    hidden,
  }
})
