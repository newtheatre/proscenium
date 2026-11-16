// Contract for core.erasure-handler: erasure work the data-class registry cannot express, such as
// deleting a stored file. It adds statements to the erasure's unit of work.
import type { UnitView } from '#kit'

export interface ErasureHandler {
  erase: (unit: UnitView, subject: { accountId?: string, emails: string[] }) => Promise<void>
}
