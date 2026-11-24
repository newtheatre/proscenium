// Contract for core.public-wording (C-67): a season's own words on its public pages, such as a
// festival's "event" for production. Staff screens never change.
export const WORDING_TERMS = ['production', 'productions', 'performance', 'performances', 'season', 'seasons', 'company', 'companies'] as const
export type WordingTerm = typeof WORDING_TERMS[number]
/** Each term a contributor changes, as a translation key holding the word in lower case. */
export type Wording = Partial<Record<WordingTerm, string>>

export interface PublicWording {
  /** One cheap read: whether these words are this season's. */
  appliesTo: (seasonId: string) => Promise<boolean>
  terms: Wording
}
