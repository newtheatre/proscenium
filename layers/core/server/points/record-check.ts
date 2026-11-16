// Contract for core.record-check: one line of a record's readiness checklist. It reports and never
// blocks; whether a missing line stops the action stays the owning module's own rule.
export interface RecordCheck {
  /** The record type it belongs to, such as `core.production`. */
  record: string
  ability: string | string[]
  order: number
  check: (recordId: string) => Promise<{ done: boolean, sentence: string, link?: string }>
}
