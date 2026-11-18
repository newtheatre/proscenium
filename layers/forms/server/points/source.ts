// Contract for forms.source: somewhere a "record from a source" question chooses from (form builder
// specification, part 4, and Matt's ruling of 17 November: one question type, many sources). A
// module contributes one for each kind of record it wants forms to be able to ask for. Forms keeps
// the chosen ids as the answer and the labels as they read when it was sent.
import type { Actor } from '#kit'

export interface SourceResult { id: string, label: string, detail?: string }

export interface FormsSource {
  /** What a question names: `<module>.<record>`, such as `core.production`. Never changes. */
  key: string
  /** The translation key of its name in the builder. */
  label: string
  /** The answers are accounts: such a question may be marked "people involved" for the conflict lockout. */
  people?: boolean
  /** Whether this person may search the source and read its labels. Nobody else is shown anything of it. */
  allowed: (actor: Actor) => Promise<boolean>
  /** Up to twenty records this person may see that match what they typed. */
  search: (text: string, actor: Actor) => Promise<SourceResult[]>
  /** The labels of records by id. An id that is not a record of this source is left out. Not checked against a person: forms calls it for answers already given. */
  labels: (ids: string[]) => Promise<Record<string, string>>
}
