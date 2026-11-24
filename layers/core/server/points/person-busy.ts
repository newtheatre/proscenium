// Contract for core.person-busy (C-66): the times a module holds people elsewhere (a performance
// they are credited on, a rota shift, a rehearsal call), so a planner warns without reading its tables.
export interface PersonBusyQuery {
  /** At most 90 accounts, those the reader asked about; core chunks a longer list. */
  accountIds: string[]
  /** The window, [from, to) in UTC milliseconds. */
  from: number
  to: number
}

export interface PersonBusyItem {
  accountId: string
  /** The contributor's own word for it, kebab-case, such as performance, shift or pencil. */
  kind: string
  from: number
  to: number
  /** Confirmed: a scheduled performance, a confirmed shift. A draft or a pencil is not. */
  firm: boolean
  /** A translation key, such as core.person-busy.performance: never a name or words. */
  labelKey: string
  record: { type: string, id: string } | null
}

export interface PersonBusy {
  /** Answers only about `accountIds`, naming nobody else. */
  busy: (query: PersonBusyQuery) => Promise<PersonBusyItem[]>
}
