// A people report's table (rule P8): one row per person (and per value of its one breakdown), up to
// six figures side by side, and each total as its module gives it, never added up from the people.
import type { Shown } from './table'

export interface PeopleColumn { id: string, label: string, unit: 'count' | 'minutes', shown: boolean }
export interface PeopleRow { person: string, name: string, key?: string, keyLabel?: string, values: (number | null)[] }

export interface PeopleTable {
  columns: PeopleColumn[]
  rows: PeopleRow[]
  totals: Shown[]
  unavailable: { measure: string, reason: string }[]
  by: string | null
  byLabel: string | null
  hidden: number
}
