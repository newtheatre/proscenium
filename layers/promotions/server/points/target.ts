// Contract for promotions.target: a kind of item a selling module sells, which a promotion can
// apply to or require (the unified promotions design, "How modules plug in"). The contribution's id
// is the kind, such as 'box-office.ticket'. Promotions stores a target's narrowing as the module's
// own JSON and never reads inside it; the module checks it, describes it and matches items to it.

/** One way to narrow the kind, shown as a picker in the promotion form. */
export interface TargetField {
  id: string
  /** The picker's label, as a translation key. */
  label: string
  /** What may be picked. `parent`: the value of the field named by the field's `parent` it belongs to. */
  options: { value: string, label: string, parent?: string }[]
  /** Another field of this kind whose choice this one narrows within, such as a show's performances. */
  parent?: string
  /** Shown only once its parent has a value. */
  needsParent?: boolean
}

export type Scope = Record<string, string>

export interface PromotionTarget {
  /** The kind's name in the form, as a translation key, such as "Tickets". */
  label: string
  /** The module whose switch turns the kind on and off. */
  module?: string
  /** Its place in the form's list of kinds. */
  order?: number
  /** The pickers, with their options now. Reads only. */
  fields: () => Promise<TargetField[]>
  /**
   * A narrowing as typed, made whole and checked: unknown keys dropped, a child's parent filled in.
   * Refuses, naming the field, when it names something that is not there.
   */
  check: (scope: Scope) => Promise<Scope>
  /** Words for a narrowing, for the list of promotions; null for the whole kind. Reads only. */
  describe: (scope: Scope) => Promise<string | null>
  /** Whether an item's facts, as the module gave them to priceSale, fall within a narrowing. */
  matches: (scope: Scope, facts: Record<string, unknown>) => boolean
  /** Which of these references (a seat's claim, a bar line) still stand; a saving on any other has been given back. */
  live: (refs: string[]) => Promise<Set<string>>
}
