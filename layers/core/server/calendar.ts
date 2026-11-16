// The operating day (C-37): a theatre's day runs from the rollover time to the next, so a show that
// ends at 00:30 belongs to the evening it started. Every module asks here rather than doing its own
// arithmetic with the time zone.
import { all, createUnit, usePoint, useSetting } from '#kit'
import { instantOfLocal, localDateOf, localParts, previousDate } from '#kit/clock'

export interface DayRule { timeZone: string, rollover: string }

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) // not-policy: minutes in an hour

/** Pure: the operating day an instant falls in, YYYY-MM-DD. */
export function operatingDayAt(ms: number, rule: DayRule): string {
  const p = localParts(ms, rule.timeZone)
  const date = localDateOf(ms, rule.timeZone)
  return p.hour * 60 + p.minute < minutesOf(rule.rollover) ? previousDate(date) : date // not-policy: minutes in an hour
}

/** Pure: the first instant of an operating day and the first instant of the next. */
export function operatingDayBounds(day: string, rule: DayRule): { start: number, end: number } {
  return { start: instantOfLocal(day, rule.rollover, rule.timeZone), end: instantOfLocal(previousDate(day, -1), rule.rollover, rule.timeZone) }
}

export async function dayRule(): Promise<DayRule> {
  return { timeZone: await useSetting('core.locale.time-zone') as string, rollover: await useSetting('core.organisation.day-rollover') as string }
}

/** The operating day of an instant, with the theatre's own settings. */
export async function operatingDayOf(ms: number): Promise<string> {
  return operatingDayAt(ms, await dayRule())
}

export async function dayBounds(day: string): Promise<{ start: number, end: number }> {
  return operatingDayBounds(day, await dayRule())
}

interface OperatingDayTable { id: string, table: string, key: string, instant: string, day: string, done?: string }

/** Every row whose stored operating day differs from the one this rule gives. */
export async function rowsToRecompute(rule: DayRule): Promise<{ table: OperatingDayTable, key: string, day: string }[]> {
  const out: { table: OperatingDayTable, key: string, day: string }[] = []
  for (const { value: table } of await usePoint<OperatingDayTable>('core.operating-day')) {
    const where = table.done ? ` WHERE "${table.done}" IS NULL` : ''
    const rows = await all<{ k: string, at: number | null, day: string | null }>(`SELECT "${table.key}" AS k, "${table.instant}" AS at, "${table.day}" AS day FROM "${table.table}"${where}`)
    for (const row of rows) {
      if (row.at === null) continue
      const day = operatingDayAt(row.at, rule)
      if (day !== row.day) out.push({ table, key: row.k, day })
    }
  }
  return out
}

/** Rewrites stored operating days, a statement-limit's worth of rows to a unit. */
export async function recomputeDays(): Promise<number> {
  const changes = await rowsToRecompute(await dayRule())
  const limit = await useSetting('core.units.statement-limit') as number
  for (let i = 0; i < changes.length; i += limit) {
    const unit = createUnit()
    for (const change of changes.slice(i, i + limit)) {
      unit.add({ sql: `UPDATE "${change.table.table}" SET "${change.table.day}" = ? WHERE "${change.table.key}" = ?`, params: [change.day, change.key] })
    }
    await unit.commit()
  }
  return changes.length
}
