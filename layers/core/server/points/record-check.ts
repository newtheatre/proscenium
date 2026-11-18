// Contract for core.record-check: one line of a record's readiness checklist. It reports and never
// blocks; whether a missing line stops the action stays the owning module's own rule.
export interface RecordCheck {
  /** The record type it belongs to, such as `core.production`. */
  record: string
  ability: string | string[]
  order: number
  /**
   * The line for one record, or null when it asks nothing of this theatre. `needed` says the owner's
   * action stops without it, so the page can tell what must be done from what is only wanted.
   */
  check: (recordId: string) => Promise<{ done: boolean, sentence: string, link?: string, needed?: boolean } | null>
}
