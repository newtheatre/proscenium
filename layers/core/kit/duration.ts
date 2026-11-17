// Durations are written as '30m', '2h', '14d' (and '45s', '0m', '6mo' or '7y') and stored as whole
// seconds. A month is 30 days and a year is 365 days, for display and for the duration control.
const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, mo: 2_592_000, y: 31_536_000 } // not-policy: units of time

export const DURATION = /^(\d+)(s|m|h|d|w|mo|y)$/

export function parseDuration(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${value} is not a whole number of seconds`)
    return value
  }
  const match = DURATION.exec(value.trim())
  if (!match) throw new Error(`"${value}" is not a duration such as 30m, 2h or 14d`)
  return Number(match[1]) * UNITS[match[2]!]!
}

export function isDuration(value: unknown): boolean {
  return typeof value === 'string' && DURATION.test(value)
}

/** The units a duration is shown in, largest first, with their size in seconds. */
export const DURATION_UNITS = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1],
] as const // not-policy: units of time
export type DurationUnit = typeof DURATION_UNITS[number][0]

/** The largest unit that divides the seconds exactly: 2555 days is 7 years, 30 days is 1 month. */
export function exactUnit(seconds: number): { count: number, unit: DurationUnit } {
  for (const [unit, size] of DURATION_UNITS) if (seconds >= size && seconds % size === 0) return { count: seconds / size, unit }
  return { count: 0, unit: 'minute' }
}

/** Seconds as words: 1800 → "30 minutes", 2592000 → "1 month". */
export function formatDuration(seconds: number): string {
  const { count, unit } = exactUnit(seconds)
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/**
 * The units a duration control offers between two limits in seconds: only those that can hold a
 * whole number of themselves inside the limits. With no limits every unit is offered.
 */
export function unitsWithin(min = 0, max = Number.POSITIVE_INFINITY): DurationUnit[] {
  return DURATION_UNITS.filter(([, size]) => Math.max(1, Math.ceil(min / size)) * size <= max).map(([unit]) => unit)
}

/**
 * How a control shows a stored value: in the largest offered unit that divides it exactly, so 2555
 * days reads 7 years. A value no offered unit divides is shown in the largest unit that does.
 */
export function durationParts(seconds: number, offered: readonly DurationUnit[] = DURATION_UNITS.map(([unit]) => unit)): { count: number, unit: DurationUnit } {
  if (seconds === 0) return { count: 0, unit: offered[0] ?? 'minute' }
  for (const [unit, size] of DURATION_UNITS) if (offered.includes(unit) && seconds % size === 0) return { count: seconds / size, unit }
  return exactUnit(seconds)
}

/** The seconds in a count of a unit. */
export function unitSeconds(unit: DurationUnit): number {
  return DURATION_UNITS.find(([name]) => name === unit)![1]
}
