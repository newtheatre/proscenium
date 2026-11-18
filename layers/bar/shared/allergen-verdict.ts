// What an allergen answer means for someone avoiding some of the 14, in one place so the public chart and
// the till's Allergens sheet can agree. Pure: it returns what happened and which allergens, never words.
export interface AllergenFacts { contains: string[], mayContain: string[], checked: boolean }
export interface ItemFacts extends AllergenFacts { dependsOnChoice?: boolean }
export interface ChoiceFacts { group: string, options: { label: string, allergens: AllergenFacts }[] }

export type VerdictKind = 'contains' | 'may-contain' | 'not-checked' | 'depends' | 'none-listed'
export interface Verdict {
  kind: VerdictKind
  /** The avoided allergens it is about (empty for not checked and none listed). */
  hit: string[]
  /** For 'depends': the names of the choice groups whose options matter. */
  groups: string[]
}

/** One answer on its own (an option, or an item with nothing to pick): the worst of contains, may contain or not checked. */
export function answerVerdict(avoid: string[], a: AllergenFacts): Verdict {
  const contains = avoid.filter(k => a.contains.includes(k))
  if (contains.length) return { kind: 'contains', hit: contains, groups: [] }
  if (!a.checked) return { kind: 'not-checked', hit: [], groups: [] }
  const may = avoid.filter(k => a.mayContain.includes(k))
  if (may.length) return { kind: 'may-contain', hit: may, groups: [] }
  return { kind: 'none-listed', hit: [], groups: [] }
}

/**
 * An item with its choices. What its own answer says comes first. Otherwise, when the item depends on a
 * choice and any option offered contains, may contain or has not been checked for something avoided, it
 * depends on that choice: never "none listed", because the item's own label is not the whole of it.
 */
export function itemVerdict(avoid: string[], item: ItemFacts, choices: ChoiceFacts[]): Verdict | null {
  if (!avoid.length) return null
  const own = answerVerdict(avoid, item)
  if (own.kind === 'contains' || own.kind === 'not-checked') return own
  if (item.dependsOnChoice) {
    const groups = choices.filter(c => c.options.some(o => answerVerdict(avoid, o.allergens).kind !== 'none-listed')).map(c => c.group)
    if (groups.length) return { kind: 'depends', hit: [], groups }
  }
  return own
}
