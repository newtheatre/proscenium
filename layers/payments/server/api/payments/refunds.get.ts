// Refunds (Box office specification, part 5): a declared list, newest first, waiting for approval by
// default; searched by who asked, through findAccounts. Each row says whether a person hands the
// money back.
import { and, count, sql } from 'drizzle-orm'
import { getQuery } from 'nuxt/server'
import { defineRoute, readListQuery, searchWords, useDb } from '#kit'
import { findAccounts } from '#modules/core'
import { refunds } from '../../db/schema'
import source from '../../lists/refunds'
import { refundsList } from '../../../shared/lists'
import { describeRefunds } from '../../refunds'

export default defineRoute({ ability: 'payments.refund.approve', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const byPerson = words.length ? sql`${refunds.requestedBy} IN (${await findAccounts(unit.view(), actor, typed, refundsList.id)})` : undefined
  const where = and(read.where(), typed && !searchTooShort ? (byPerson ?? sql`0`) : undefined)
  const db = useDb()
  const found = await db.select({ id: refunds.id }).from(refunds).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(refunds).where(where) as [{ n: number }]
  return { rows: await describeRefunds(found.map(r => r.id)), total, dropped: read.dropped, ignoredWords, searchTooShort }
})
