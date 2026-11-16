// Durations are written as '30m', '2h', '14d' (and '45s' or '0m') and stored as whole seconds.
const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 } // not-policy: units of time

export const DURATION = /^(\d+)([smhdw])$/

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

/** Seconds as words: 1800 → "30 minutes". */
export function formatDuration(seconds: number): string {
  const parts: [number, string][] = [[604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']] // not-policy: units of time
  for (const [size, word] of parts) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size
      return `${n} ${word}${n === 1 ? '' : 's'}`
    }
  }
  return seconds === 0 ? '0 minutes' : `${seconds} seconds`
}
