// Contract for core.file-access: whether an account may read the files of a record whose slot has
// `record` access. Contributions are keyed by the record type that owns the files (the slot's
// owner), so the module that owns the record decides. With no contribution, nobody may.
import type { Actor } from '#kit'

export interface FileAccess {
  canRead: (actor: Actor, record: { type: string, id: string }, file: { id: string, slot: string }) => Promise<boolean>
}
