// UI copy that has to agree with a number. "1 account(s)" is what a screen says when nobody
// bothered, so this is the one place that bothers.

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

// "Bar, Door and Duty manager": a list read as a sentence, with no comma before the "and".
export function saysList(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

// "That is the 3rd booking not used this year": a count read as a position. 11 to 13 take "th"
// whatever their last digit would otherwise ask for.
export function ordinal(count: number): string {
  const size = Math.abs(Math.trunc(count))
  const teens = size % 100
  const suffix = teens >= 11 && teens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][size % 10] ?? 'th')
  return `${count}${suffix}`
}

// Ends quoted words with a full stop unless they already end a sentence, so an officer's
// "short notice." is not printed as "short notice..". Reads escaped quotes too, for the HTML part.
export function asSentence(words: string): string {
  const trimmed = words.trim()
  if (!trimmed) return trimmed
  return /[.!?…](?:["'”’)\]]|&quot;|&#39;)*$/.test(trimmed) ? trimmed : `${trimmed}.`
}
