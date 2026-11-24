// Contract for core.record-resolver: given a record id of the contributed type, its title, its
// address and its parent record. Contributions are keyed by the record type they resolve.
export interface RecordResolver {
  resolve: (id: string) => Promise<{ title: string, to?: string, parent?: { type: string, id: string } } | null>
  /**
   * The records a theatre may pin a fact mapping to (Foundations, "A fact mapping may be pinned"),
   * current ones first, at most `limit`. Only a type a pinnable fact is on needs it.
   */
  choices?: (limit: number) => Promise<{ id: string, title: string }[]>
}
