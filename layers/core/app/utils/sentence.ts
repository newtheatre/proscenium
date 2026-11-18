// A heading or label put inside a sentence: "The theatre" becomes "theatre" in "Save theatre
// settings". Lower-cases the first letter unless the first word has a capital after its first letter
// (VAT, PDFs, PayPal), and with `article: false` drops a leading "The".

const ARTICLE = /^the\s+(?=\S)/i

export function inSentence(text: string, options: { article?: boolean } = {}): string {
  const trimmed = text.trim()
  const words = options.article === false ? trimmed.replace(ARTICLE, '') : trimmed
  const first = words.split(/\s/, 1)[0] ?? ''
  if (/[A-Z]/.test(first.slice(1))) return words
  return words.charAt(0).toLowerCase() + words.slice(1)
}
