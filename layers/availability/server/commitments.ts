// Commitments (A5, F4): what core.person-busy holds people to, cut into each local day's minutes.
import { instantOfLocal, localDateOf, localParts } from '#kit/clock'
import { personsBusy, type BusyRow } from '#modules/person-busy'
import { addDays, DAY_MINUTES, type Commitment, type Span } from '../shared/grid'

/** Our own contribution's stated busy time, which the levels already show. */
const stated = (row: BusyRow) => row.source === 'availability' && row.kind === 'unavailable'

/** An instant range cut at local midnights, in minutes past each date's midnight. */
export function localSpans(from: number, to: number, zone: string): (Span & { date: string })[] {
  const out: (Span & { date: string })[] = []
  for (let at = from; at < to;) {
    const date = localDateOf(at, zone)
    const next = instantOfLocal(addDays(date, 1), '00:00', zone)
    const end = Math.min(to, next)
    const [p, e] = [localParts(at, zone), localParts(end, zone)]
    out.push({ date, start: p.hour * 60 + p.minute, end: end === next ? DAY_MINUTES : e.hour * 60 + e.minute }) // not-policy: minutes in an hour
    at = next
  }
  return out
}

/** Each person's commitments by local date over `dates` (in order), stated busy time left out. */
export async function commitmentsOf(ids: string[], dates: string[], zone: string): Promise<Record<string, Record<string, Commitment[]>>> {
  const out: Record<string, Record<string, Commitment[]>> = {}
  if (!ids.length || !dates.length) return out
  const from = instantOfLocal(dates[0]!, '00:00', zone)
  const to = instantOfLocal(addDays(dates.at(-1)!, 1), '00:00', zone)
  for (const row of await personsBusy(ids, from, to)) {
    if (stated(row)) continue
    for (const s of localSpans(Math.max(row.from, from), Math.min(row.to, to), zone)) {
      ((out[row.accountId] ??= {})[s.date] ??= []).push({ start: s.start, end: s.end, labelKey: row.labelKey, firm: row.firm })
    }
  }
  return out
}
