// Contract for core.record-resolver: given a record id of the contributed type, its title, its
// address and its parent record. Contributions are keyed by the record type they resolve.
export interface RecordResolver {
  resolve: (id: string) => Promise<{ title: string, to?: string, parent?: { type: string, id: string } } | null>
}
