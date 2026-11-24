// Closing and reopening a period (FIN-02). Closing is an appended row, never a flag, and carries the
// period's totals at that moment so a later mismatch shows. Triggers make the order of closes safe
// against a race: a period closes only once every earlier one is closed, and a close or a reopen
// must follow the opposite state.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, Refusal, today, usePoint, useContext, theatreTimeZone, type UnitView } from '#kit'
import { instantOfLocal, previousDate } from '#kit/clock'
import { assertTerm } from '#modules/core'
import { closedSql, getPeriod, type PeriodState } from './periods'
import type { PeriodBounds, PeriodCloseCheck } from './points/period-close-check'

export interface Blocker { sentence: string, to?: string, module: string }

/** Everything that stops `period` being closed now. An empty list means it may be closed. */
export async function closeBlockers(period: PeriodState): Promise<Blocker[]> {
  const out: Blocker[] = []
  if (period.closed) return out
  const day = await today()
  if (period.endsOn >= day) out.push({ module: 'finance', sentence: `${period.label} has not ended yet. It can be closed from the day after it ends.` })
  const earlier = await all<{ id: string, label: string }>(`SELECT p.id, p.label FROM finance_periods p WHERE p.starts_on < ? AND NOT ${closedSql('p')} ORDER BY p.starts_on`, period.startsOn)
  for (const e of earlier) out.push({ module: 'finance', sentence: `${e.label} comes first and is still open.`, to: `/console/finance/periods/${e.id}` })
  const unsealed = await first<{ n: number }>('SELECT count(*) AS n FROM finance_postings p WHERE p.period_id = ? AND NOT EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = p.id)', period.id)
  if (unsealed?.n) out.push({ module: 'finance', sentence: `${unsealed.n} posting${unsealed.n === 1 ? ' has' : 's have'} no seal. Report this as a fault.` })
  const totals = await periodTotals(period.id)
  if (totals.debitsMinor !== totals.creditsMinor) out.push({ module: 'finance', sentence: 'The period\'s debits and credits differ. Report this as a fault.' })

  const bounds = await boundsOf(period)
  for (const check of await usePoint<PeriodCloseCheck>('finance.period-close-check')) {
    for (const blocker of await check.value.blockers?.(bounds) ?? []) out.push({ ...blocker, module: check.module })
  }
  return out
}

/** What other modules want the treasurer to know before closing `period`; none of it stops the close. */
export async function closeWarnings(period: PeriodState): Promise<Blocker[]> {
  if (period.closed) return []
  const bounds = await boundsOf(period)
  const out: Blocker[] = []
  for (const check of await usePoint<PeriodCloseCheck>('finance.period-close-check')) {
    for (const warning of await check.value.warnings?.(bounds) ?? []) out.push({ ...warning, module: check.module })
  }
  return out
}

async function boundsOf(period: PeriodState): Promise<PeriodBounds> {
  const zone = await theatreTimeZone()
  return {
    id: period.id,
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    startsAt: instantOfLocal(period.startsOn, '00:00', zone),
    endsAt: instantOfLocal(previousDate(period.endsOn, -1), '00:00', zone),
  }
}

/** The sealed debits and credits posted into a period, each a positive figure. */
export async function periodTotals(periodId: string): Promise<{ debitsMinor: number, creditsMinor: number }> {
  const row = await first<{ debits: number, credits: number }>(`SELECT coalesce(sum(CASE WHEN e.amount_minor > 0 THEN e.amount_minor END), 0) AS debits,
      coalesce(sum(CASE WHEN e.amount_minor < 0 THEN -e.amount_minor END), 0) AS credits
    FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_seals s ON s.posting_id = p.id WHERE p.period_id = ?`, periodId)
  return { debitsMinor: row?.debits ?? 0, creditsMinor: row?.credits ?? 0 }
}

/**
 * The close row, with the totals taken inside the batch so they are the ones the close saw. A
 * reopen's reason must be a live term of the theatre's list of reasons, or nothing is written.
 */
function closeRow(unit: UnitView, periodId: string, action: 'close' | 'reopen', reasonTermId: string | null) {
  const { actor } = useContext()
  const reason = reasonTermId ? sql`HAVING ${assertTerm(reasonTermId, 'finance.reopen-reason')}` : sql``
  unit.add(sql`INSERT INTO finance_period_closes (id, period_id, action, by, at, debits_minor, credits_minor, reason_term_id)
      SELECT ${newId('pcl')}, ${periodId}, ${action}, ${actor.accountId ?? null}, ${nowMs()},
        coalesce(sum(CASE WHEN e.amount_minor > 0 THEN e.amount_minor END), 0),
        coalesce(sum(CASE WHEN e.amount_minor < 0 THEN -e.amount_minor END), 0), ${reasonTermId}
      FROM finance_postings p JOIN finance_seals s ON s.posting_id = p.id JOIN finance_entries e ON e.posting_id = p.id
      WHERE p.period_id = ${periodId} ${reason}`)
    .expect(1, reasonTermId ? { code: 'finance.period.reason-unknown', reason: 'Choose a reason from the list.' } : {})
}

export async function closePeriod(unit: UnitView, periodId: string): Promise<void> {
  const period = await getPeriod(periodId)
  if (!period) throw new Refusal('core.not-found', 'There is no such period.', { status: 404 })
  if (period.closed) throw new Refusal('finance.period.already-closed', `${period.label} is already closed.`, { status: 409 })
  const blockers = await closeBlockers(period)
  if (blockers.length) throw new Refusal('finance.period.blocked', `${period.label} cannot be closed yet: ${blockers.map(b => b.sentence).join(' ')}`, { status: 409, remedy: 'Deal with each item on the Periods screen, then close again.' })
  closeRow(unit, periodId, 'close', null)
  unit.announce('finance.period.closed', { periodId }, { record: ['finance.period', periodId] })
}

export async function reopenPeriod(unit: UnitView, periodId: string, reasonTermId: string): Promise<void> {
  const period = await getPeriod(periodId)
  if (!period) throw new Refusal('core.not-found', 'There is no such period.', { status: 404 })
  if (!period.closed) throw new Refusal('finance.period.not-closed', `${period.label} is open.`, { status: 409 })
  closeRow(unit, periodId, 'reopen', reasonTermId)
  unit.announce('finance.period.reopened', { periodId }, { record: ['finance.period', periodId] })
}
