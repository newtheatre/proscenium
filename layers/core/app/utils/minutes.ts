// Minutes as words for a summary line (run presets, Matt 2026-11-17): 105 reads "1 hour 45 minutes".
export function minutesInWords(minutes: number): string {
  const hours = Math.floor(minutes / 60) // not-policy: minutes in an hour
  const rest = minutes % 60 // not-policy: minutes in an hour
  const parts = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (rest || !hours) parts.push(`${rest} minute${rest === 1 ? '' : 's'}`)
  return parts.join(' ')
}
