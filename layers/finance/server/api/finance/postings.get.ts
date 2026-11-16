// Sealed postings with their entries, newest first; filter by account, production, performance or
// period. Every posting names its source, so a screen can link to it.
import { z } from 'zod'
import { all, can, defineRoute, idSchema } from '#kit'

const PAGE = 50 // not-policy: one page of the ledger

export default defineRoute({
  ability: 'finance.ledger.view',
  rateLimit: 'default',
  input: z.object({
    accountId: idSchema('lac').optional(),
    periodId: idSchema('fpe').optional(),
    productionId: z.string().max(40).optional(), // not-policy: an id's bound
    performanceId: z.string().max(40).optional(), // not-policy: an id's bound
    before: idSchema('post').optional(),
  }),
}, async (_event, { input, actor }) => {
  const where = ['EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = p.id)']
  const params: unknown[] = []
  const add = (clause: string, value: unknown) => {
    where.push(clause)
    params.push(value)
  }
  if (input.periodId) add('p.period_id = ?', input.periodId)
  if (input.accountId) add('EXISTS (SELECT 1 FROM finance_entries x WHERE x.posting_id = p.id AND x.account_id = ?)', input.accountId)
  if (input.productionId) add('EXISTS (SELECT 1 FROM finance_entries x WHERE x.posting_id = p.id AND x.production_id = ?)', input.productionId)
  if (input.performanceId) add('EXISTS (SELECT 1 FROM finance_entries x WHERE x.posting_id = p.id AND x.performance_id = ?)', input.performanceId)
  if (input.before) add('p.id < ?', input.before)
  const postings = await all<{ id: string, kind: string, source_module: string, source_type: string, source_id: string, reverses_id: string | null, period_id: string, occurred_at: number, posted_at: number, posted_by: string | null }>(
    `SELECT p.id, p.kind, p.source_module, p.source_type, p.source_id, p.reverses_id, p.period_id, p.occurred_at, p.posted_at, p.posted_by FROM finance_postings p WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ${PAGE}`, ...params)
  const lines = postings.length
    ? await all<{ posting_id: string, account_id: string, code: string, name: string, amount_minor: number, currency: string, production_id: string | null, performance_id: string | null }>(
        'SELECT e.posting_id, e.account_id, a.code, a.name, e.amount_minor, e.currency, e.production_id, e.performance_id FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id IN (SELECT value FROM json_each(?)) ORDER BY e.id', JSON.stringify(postings.map(p => p.id)))
    : []
  return {
    postings: postings.map(p => ({
      id: p.id,
      kind: p.kind,
      source: { module: p.source_module, type: p.source_type, id: p.source_id },
      reversesId: p.reverses_id,
      periodId: p.period_id,
      occurredAt: p.occurred_at,
      postedAt: p.posted_at,
      postedBy: p.posted_by,
      entries: lines.filter(l => l.posting_id === p.id).map(l => ({ accountId: l.account_id, code: l.code, name: l.name, amountMinor: l.amount_minor, currency: l.currency, productionId: l.production_id, performanceId: l.performance_id })),
    })),
    next: postings.length === PAGE ? postings.at(-1)!.id : null,
    // Whether the viewer may reverse a posting, so the screen offers it only to them.
    canCorrect: (await can(actor, 'finance.posting.correct')).allowed,
  }
})
