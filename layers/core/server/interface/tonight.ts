// The Tonight hub's performances (D5, box office review): those of the theatre's current operating
// day, so a show that runs past midnight stays until the day rolls over (core.locale.day-start), each
// with the figures other modules give for it (core.tonight-figure) that this person may see, and
// when latecomers are let in, which everyone working it should know.
import { all, can, nowMs, usePoint, type Actor } from '#kit'
import { operatingDayOf } from '../calendar'
import type { TonightFigure } from '../points/tonight-figure'
import { latecomersFor, type LatecomerRule } from '../programme/latecomers'

type Answer = Awaited<ReturnType<TonightFigure['read']>>
const FIGURE_BUDGET = 1500 // not-policy: how long the hub waits for one figure

async function readFigure(figure: TonightFigure, performanceId: string): Promise<Answer> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const late = new Promise<Answer>((resolve) => {
      timer = setTimeout(() => resolve({ value: null, state: 'unavailable' }), FIGURE_BUDGET)
    })
    return await Promise.race([Promise.resolve(figure.read(performanceId)), late])
  }
  catch {
    return { value: null, state: 'unavailable' }
  }
  finally {
    clearTimeout(timer)
  }
}

export interface TonightPerformance {
  id: string
  title: string
  label: string | null
  startsAt: number
  venue: string
  /** When latecomers are let in, for everyone working it. */
  latecomers: LatecomerRule
  figures: ({ id: string, label: string } & Answer)[]
}

/** Today's performances (by the operating day) and the figures this person may see on each. */
export async function tonight(actor: Actor): Promise<TonightPerformance[]> {
  const day = await operatingDayOf(nowMs())
  const rows = await all<{ id: string, title: string, label: string | null, starts_at: number, venue: string }>(
    `SELECT f.id, p.title, f.label, f.starts_at, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
      JOIN core_venues v ON v.id = f.venue_id WHERE f.state = 'scheduled' AND f.operating_day = ? ORDER BY f.starts_at, f.id`, day)
  const contributions = await usePoint<TonightFigure>('core.tonight-figure')
  const latecomers = await latecomersFor(rows.map(r => r.id))
  const out: TonightPerformance[] = []
  for (const r of rows) {
    const figures: TonightPerformance['figures'] = []
    for (const c of contributions) {
      if (!(await can(actor, c.value.ability as never, ['core.performance', r.id])).allowed) continue
      figures.push({ id: c.id, label: c.value.label, ...await readFigure(c.value, r.id) })
    }
    out.push({ id: r.id, title: r.title, label: r.label, startsAt: r.starts_at, venue: r.venue, latecomers: latecomers.get(r.id)!, figures })
  }
  return out
}
