// Till sessions (Box office specification, part 5): a declared list, newest first, the cash expected
// against the cash counted; searched by who opened the session, through findAccounts. A row's canClose
// says whether the viewer may close it: a session left being counted, for someone allowed to.
import { and, count, sql } from 'drizzle-orm'
import { getQuery } from 'nuxt/server'
import { can, defineRoute, readListQuery, searchWords, useDb } from '#kit'
import { findAccounts } from '#modules/core'
import { sessions } from '../../db/schema'
import source from '../../lists/sessions'
import { sessionsList } from '../../../shared/lists'
import { describeSessions } from '../../sessions'

export default defineRoute({ ability: 'payments.session.view', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const byPerson = words.length ? sql`${sessions.openedBy} IN (${await findAccounts(unit.view(), actor, typed, sessionsList.id)})` : undefined
  const where = and(read.where(), typed && !searchTooShort ? (byPerson ?? sql`0`) : undefined)
  const db = useDb()
  const found = await db.select({ id: sessions.id }).from(sessions).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(sessions).where(where) as [{ n: number }]
  const canClose = (await can(actor, 'payments.session.close-any')).allowed
  const rows = (await describeSessions(found.map(r => r.id))).map(s => ({ ...s, canClose: canClose && s.state === 'counting' }))
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
