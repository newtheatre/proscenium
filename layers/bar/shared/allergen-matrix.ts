// The allergen matrix's rows: a product as one row, judged on every one of its sizes. Pure, so the
// till's sheet and anything else that draws the matrix mark the same squares.
import type { AllergenFacts } from './allergen-verdict'

/** The 14 allergens UK law names, in the order the matrix's columns run. */
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const
export type Allergen = typeof ALLERGENS[number]

export type Mark = 'contains' | 'may-contain' | null
export interface MatrixAnswer {
  contains: Allergen[]
  mayContain: Allergen[]
  /** Whether every size was checked, some were, or none. */
  checked: 'all' | 'some' | 'none'
}

/** A row of the matrix. A `sub` row is a choice offered on the row above; `note` says where it stands. */
export interface MatrixRow extends MatrixAnswer {
  key: string
  name: string
  sub?: boolean
  note?: { tone: 'error' | 'warning' | 'success' | 'neutral', text: string } | null
}
export interface MatrixSection { key: string, heading: string | null, rows: MatrixRow[] }

/** Every size's answer as one: what any checked size contains or may contain, in column order. */
export function matrixAnswer(list: (AllergenFacts | undefined)[]): MatrixAnswer {
  const checked = list.filter((a): a is AllergenFacts => !!a?.checked)
  const contains = ALLERGENS.filter(k => checked.some(a => a.contains.includes(k)))
  const mayContain = ALLERGENS.filter(k => !contains.includes(k) && checked.some(a => a.mayContain.includes(k)))
  return { contains, mayContain, checked: !checked.length ? 'none' : checked.length < list.length ? 'some' : 'all' }
}

/** One square: contains wins over may contain; an unmarked square says nothing was recorded. */
export const markOf = (a: Pick<MatrixAnswer, 'contains' | 'mayContain'>, k: Allergen): Mark =>
  a.contains.includes(k) ? 'contains' : a.mayContain.includes(k) ? 'may-contain' : null
