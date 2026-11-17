// The ledger (Box office specification, part 5): a declared list of sealed postings, newest first,
// each with its entries and where it came from, so a screen can link to it. Search finds a posting by
// an account's code or name, or by its source's reference. A row's canReverse says whether the
// viewer may reverse it: an original posting, for someone allowed to correct.
import { and, count, sql, type SQL } from 'drizzle-orm'
import { getQuery } from 'h3'
import { all, can, defineRoute, readListQuery, searchWords, useDb } from '#kit'
import { postings } from '../../db/schema'
import source from '../../lists/ledger'

/** Each word must match an account on one of the posting's entries, or the source's reference. */
function matching(words: string[]): SQL | undefined {
  if (!words.length) return undefined
  const like = (w: string) => w.replace(/[\\%_]/g, c => `\\${c}`)
  return and(...words.map(w => sql`(lower(${postings.sourceId}) = ${w} OR EXISTS (SELECT 1 FROM finance_entries x JOIN finance_accounts a ON a.id = x.account_id WHERE x.posting_id = ${postings.id} AND (lower(a.code) LIKE ${`${like(w)}%`} ESCAPE '\\' OR lower(a.name) LIKE ${`%${like(w)}%`} ESCAPE '\\')))`))
}

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async (event, { actor }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const sealed = sql`EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = ${postings.id})`
  const where = and(sealed, read.where(), typed && !searchTooShort ? matching(words) : undefined)
  const db = useDb()
  const found = await db.select({ id: postings.id, kind: postings.kind, sourceModule: postings.sourceModule, sourceType: postings.sourceType, sourceId: postings.sourceId, reversesId: postings.reversesId, periodId: postings.periodId, occurredAt: postings.occurredAt, postedAt: postings.postedAt, postedBy: postings.postedBy })
    .from(postings).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(postings).where(where) as [{ n: number }]
  const lines = found.length
    ? await all<{ posting_id: string, account_id: string, code: string, name: string, amount_minor: number, currency: string, production_id: string | null, performance_id: string | null }>(
        'SELECT e.posting_id, e.account_id, a.code, a.name, e.amount_minor, e.currency, e.production_id, e.performance_id FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id IN (SELECT value FROM json_each(?)) ORDER BY e.id', JSON.stringify(found.map(p => p.id)))
    : []
  const canCorrect = (await can(actor, 'finance.posting.correct')).allowed
  const rows = found.map(p => ({
    id: p.id,
    kind: p.kind,
    source: { module: p.sourceModule, type: p.sourceType, id: p.sourceId },
    reversesId: p.reversesId,
    periodId: p.periodId,
    occurredAt: p.occurredAt,
    postedAt: p.postedAt,
    postedBy: p.postedBy,
    entries: lines.filter(l => l.posting_id === p.id).map(l => ({ accountId: l.account_id, code: l.code, name: l.name, amountMinor: l.amount_minor, currency: l.currency, productionId: l.production_id, performanceId: l.performance_id })),
    canReverse: canCorrect && !p.reversesId,
  }))
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
