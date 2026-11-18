// Contract for core.erasure-handler: erasure work the data-class registry cannot express, such as
// deleting a stored file. Each handler gets a stage of the erasure, its own unit of work, after the
// account is locked and before the registry's steps clear anything; it adds a few statements to that
// unit. A stage can run again, so every statement must only touch what is still there to erase.
import type { UnitView } from '#kit'

export interface ErasureHandler {
  erase: (unit: UnitView, subject: { accountId?: string, emails: string[] }) => Promise<void>
}
