// Reading the members list (tab 5, "Members"): one row per membership, with the person, their number,
// the scheme and the status worked out from today (D1). Searched by member number, or by name or
// address through findAccounts. Applications are in their own queue, so pending rows are left out.
// The list route reads a page; the export reads the whole view.
import { and, count, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { all, readListQuery, searchWords, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { accountLabel, findAccounts } from '#modules/core'
import { memberships } from './db/schema'
import source from './lists/members'
import { membersList } from '../shared/lists'
import { derivedStatus } from './dates'
import { todayOrNull } from './memberships'

const ENDS = sql`date(${memberships.endsOn}, '+' || (SELECT grace_days FROM membership_schemes s WHERE s.id = ${memberships.schemeId}) || ' days')`

/** D1 as SQL, for each status the filter offers, on the given day. */
function statusWhere(status: string, day: string): SQL {
  const active = sql`${memberships.state} = 'active'`
  switch (status) {
    case 'upcoming': return sql`${active} AND ${memberships.startsOn} > ${day}`
    case 'current': return sql`${active} AND ${memberships.startsOn} <= ${day} AND (${memberships.endsOn} IS NULL OR ${memberships.endsOn} >= ${day})`
    case 'in-grace': return sql`${active} AND ${memberships.endsOn} < ${day} AND ${ENDS} >= ${day}`
    case 'lapsed': return sql`${active} AND ${ENDS} < ${day}`
    default: return sql`${memberships.state} = 'ended'`
  }
}

/** The most rows one export holds. */
export const EXPORT_LIMIT = 10_000 // not-policy: a bound on one export

export interface MemberRow { id: string, accountId: string | null, name: string, number: string | null, scheme: string, status: string, until: string | null, joined: string | null }

/** The members list as the query asks for it: one page, or with `whole`, the whole view. */
export async function readMembers(query: Record<string, string | string[] | undefined>, actor: Actor, unit: UnitView, whole = false) {
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const day = await todayOrNull() ?? '0000-01-01'
  const statuses = (read.filters as { status?: string[] }).status
  const byStatus = statuses?.length ? or(...statuses.map(s => statusWhere(s, day))) : undefined

  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const prefix = String(await useSetting('membership.numbers.prefix') ?? '').toLowerCase()
  const digits = typed.toLowerCase().replace(prefix, '').replace(/\s+/g, '')
  const byNumber = /^\d{1,9}$/.test(digits) ? sql`${memberships.accountId} IN (SELECT account_id FROM membership_members WHERE number = ${Number(digits)})` : undefined // not-policy: the shape of a member number
  const byPerson = words.length ? sql`${memberships.accountId} IN (${await findAccounts(unit, actor, typed, membersList.id)})` : undefined
  const where = and(read.where(), ne(memberships.state, 'pending'), inArray(memberships.state, ['active', 'ended']), byStatus, typed ? (or(byNumber, byPerson) ?? sql`0`) : undefined)

  const db = useDb()
  const found = await db.select({
    id: memberships.id, accountId: memberships.accountId, schemeId: memberships.schemeId, state: memberships.state,
    startsOn: memberships.startsOn, endsOn: memberships.endsOn, createdAt: memberships.createdAt,
  }).from(memberships).where(where).orderBy(...read.orderBy()).limit(whole ? EXPORT_LIMIT : read.limit).offset(whole ? 0 : read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(memberships).where(where) as [{ n: number }]

  const schemes = new Map((await all<{ id: string, name: string, grace_days: number }>('SELECT id, name, grace_days FROM membership_schemes')).map(s => [s.id, s]))
  const label = String(await useSetting('membership.numbers.prefix') ?? '')
  const rows: MemberRow[] = []
  for (const m of found) {
    const scheme = schemes.get(m.schemeId!)!
    const number = await all<{ number: number }>('SELECT min(number) AS number FROM membership_members WHERE account_id = ?', m.accountId) // exact-account: the row's own account, for its number
    // Joined is the person's earliest start date, so back-dated and imported members, and corrected dates, read true.
    const first = await all<{ since: string | null }>("SELECT min(starts_on) AS since FROM membership_memberships WHERE account_id = ? AND state IN ('active', 'ended')", m.accountId) // exact-account: the row's own account, for its join date
    rows.push({
      id: m.id,
      accountId: m.accountId,
      name: await accountLabel(m.accountId!),
      number: number[0]?.number ? `${label}${number[0].number}` : null,
      scheme: scheme.name,
      status: m.state === 'ended' ? 'ended' : derivedStatus({ startsOn: m.startsOn!, endsOn: m.endsOn }, scheme.grace_days, day),
      until: m.endsOn,
      joined: first[0]?.since ?? m.startsOn,
    })
  }
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
}
