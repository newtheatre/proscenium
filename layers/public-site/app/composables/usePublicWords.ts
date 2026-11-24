// A season's own words on its public pages (C-67), such as a festival's "event" for production: the
// contributor's translation key where it gives one, else the usual word. Staff screens never use this.
type Term = 'production' | 'productions' | 'performance' | 'performances' | 'season' | 'seasons' | 'company' | 'companies'

export function usePublicWords(wording: MaybeRefOrGetter<Partial<Record<Term, string>> | null | undefined>) {
  const { t } = useT()
  const word = (term: Term) => t(toValue(wording)?.[term] ?? `public-site.words.${term}`)
  /** The word to open a sentence with. */
  const Word = (term: Term) => {
    const w = word(term)
    return w.charAt(0).toLocaleUpperCase('en-GB') + w.slice(1)
  }
  return { word, Word }
}
