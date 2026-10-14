// A calendar value as YYYY-MM-DD; undefined when cleared, null while its year is still being typed.
export function civilDateOf(next: unknown): string | null | undefined {
  const date = next as { year?: unknown, month?: unknown, day?: unknown } | null | undefined
  if (typeof date?.year !== 'number' || typeof date.month !== 'number' || typeof date.day !== 'number') {
    return undefined
  }
  if (date.year < 1000) return null
  const pad = (part: number, width: number): string => String(part).padStart(width, '0')
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}
