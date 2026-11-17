// Box office's answer for the booking button on the public pages (Box office specification, part 5,
// "The booking action in the core's states"). One call answers every date on a page, in three
// reads whatever their number. A date with no sales record, or a draft with no opening time, is left
// out, so the core falls back to the external link. Seats left are given only at or under the
// theatre's setting, never the house's size.
import { all, nowMs, useSetting } from '#kit'
import type { BookingAction, BookingAnswer } from '#modules/core'

interface Sale { performance_id: string, state: string, on_sale_at: number | null, off_sale_at: number | null }

async function actions(subjects: Parameters<BookingAction['actions']>[0]): Promise<Record<string, BookingAnswer>> {
  if (!subjects.length) return {}
  const ids = JSON.stringify(subjects.map(s => s.id))
  const productionIds = JSON.stringify([...new Set(subjects.map(s => s.productionId))])
  const at = nowMs()
  const [sales, free, slugs] = await Promise.all([
    all<Sale>('SELECT performance_id, state, on_sale_at, off_sale_at FROM box_office_performance_sales WHERE performance_id IN (SELECT value FROM json_each(?))', ids),
    // Free seats as a buyer would find them: a lapsed hold nobody has swept is free (see availability.ts).
    all<{ performance_id: string, free: number }>(
      `SELECT o.performance_id, sum(max(0, o.capacity - o.claimed + (SELECT count(*) FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id
          WHERE c.pool_id = o.id AND c.state = 'held' AND c.expires_at IS NOT NULL AND c.expires_at <= ?1 AND h.kind <> 'payment'))) AS free
        FROM box_office_pools o WHERE o.performance_id IN (SELECT value FROM json_each(?2)) GROUP BY o.performance_id`, at, ids),
    all<{ id: string, slug: string }>('SELECT id, slug FROM core_productions WHERE id IN (SELECT value FROM json_each(?))', productionIds),
  ])
  const saleOf = new Map(sales.map(s => [s.performance_id, s]))
  const freeOf = new Map(free.map(f => [f.performance_id, f.free]))
  const slugOf = new Map(slugs.map(p => [p.id, p.slug]))
  const under = await useSetting('box-office.availability.show-remaining-under') as number
  const closeBefore = (await useSetting('box-office.sales.close-before') as number) * 1000 // not-policy: seconds to milliseconds

  const out: Record<string, BookingAnswer> = {}
  for (const subject of subjects) {
    const sale = saleOf.get(subject.id)
    const slug = slugOf.get(subject.productionId)
    if (!sale || !slug) continue
    const link = `/book/${slug}/${subject.id}`
    const over = at >= (sale.off_sale_at ?? subject.startsAt - closeBefore)
    if (sale.state === 'draft') {
      if (sale.on_sale_at !== null && !over) out[subject.id] = { state: 'not-yet', opensAt: sale.on_sale_at }
      continue
    }
    if (sale.state !== 'on_sale' || over) {
      out[subject.id] = { state: 'closed' }
      continue
    }
    const left = freeOf.get(subject.id) ?? 0
    out[subject.id] = left <= 0
      ? { state: 'sold-out' }
      : left <= under ? { state: 'limited', link, seatsLeft: left } : { state: 'available', link }
  }
  return out
}

export default { actions } satisfies BookingAction
