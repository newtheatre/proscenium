// How long a course's training lasts, in the largest of years, months (30 days) or days that divides
// it exactly, as core's duration control shows it.
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400]] as const // not-policy: units of time

export function validityParts(seconds: number): { unit: 'year' | 'month' | 'day', count: number } {
  for (const [unit, size] of UNITS) if (seconds % size === 0) return { unit, count: seconds / size }
  return { unit: 'day', count: Math.round(seconds / 86_400) } // not-policy: seconds in a day
}
