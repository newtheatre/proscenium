// When latecomers are let in to each performance (Matt, 2026-11-19): the production's rule, else the
// theatre's usual practice, and never "at the interval" for a performance without one. The show's
// page, the booking pages, the tickets and live mode read it here.
import { all, useSetting } from '#kit'
import { latecomerRule, type LatecomerRule } from '../../shared/latecomers'

export type { LatecomerRule }

/** The theatre's usual practice for latecomers (core.visiting.latecomers). */
export async function usualLatecomers(): Promise<LatecomerRule> {
  return latecomerRule(null, await useSetting('core.visiting.latecomers') as string, 1)
}

/** Each performance's rule, by id. An id that names no performance is left out. */
export async function latecomersFor(ids: readonly string[]): Promise<Map<string, LatecomerRule>> {
  const out = new Map<string, LatecomerRule>()
  if (!ids.length) return out
  const usual = await useSetting('core.visiting.latecomers') as string
  const rows = await all<{ id: string, rule: string | null, intervals: number | null }>(
    `SELECT f.id, p.latecomers AS rule, coalesce(f.interval_count, p.interval_count) AS intervals
       FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE f.id IN (SELECT value FROM json_each(?))`,
    JSON.stringify([...new Set(ids)]),
  )
  for (const r of rows) out.set(r.id, latecomerRule(r.rule, usual, r.intervals))
  return out
}

/** One performance's rule; the usual practice for an id that names none. */
export async function latecomersAt(id: string): Promise<LatecomerRule> {
  return (await latecomersFor([id])).get(id) ?? await usualLatecomers()
}
