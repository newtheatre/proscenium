// UI copy that has to agree with a number. "1 account(s)" is what a screen says when nobody
// bothered, so this is the one place that bothers.

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

// "That is the 3rd booking not used this year": a count read as a position. 11 to 13 take "th"
// whatever their last digit would otherwise ask for.
export function ordinal(count: number): string {
  const size = Math.abs(Math.trunc(count))
  const teens = size % 100
  const suffix = teens >= 11 && teens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][size % 10] ?? 'th')
  return `${count}${suffix}`
}
