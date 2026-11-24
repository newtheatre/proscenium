// Borrow kit (S12 to S14; INV-20, INV-27): what a member sees of the catalogue, and what a request sends.
import { z } from 'zod'
import type { Tracking } from './states'

const id = z.string().min(1).max(40) // not-policy: shape bound
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of YYYY-MM-DD

export const windowInput = z.object({ startsOn: localDate.optional(), dueBackOn: localDate.optional() })
  .refine(v => !v.startsOn === !v.dueBackOn && (!v.startsOn || v.dueBackOn! >= v.startsOn), { message: 'Choose when it goes out and comes back.', path: ['dueBackOn'] })

export const requestKitInput = z.object({
  startsOn: localDate,
  dueBackOn: localDate,
  purpose: z.string().trim().min(1).max(500), // not-policy: as the table's CHECK
  lines: z.array(z.object({ itemId: id, quantity: z.number().int().min(1).max(1_000_000).default(1) }).strict()).min(1).max(40), // not-policy: the spec's "a few to forty per loan"
}).strict().refine(v => v.dueBackOn >= v.startsOn, { message: 'It cannot be due back before it goes out.', path: ['dueBackOn'] })
export type RequestKitInput = z.infer<typeof requestKitInput>

// I9: a member sees what an item is and whether it is free, never its value, serial or owner.
export interface CatalogueItem {
  id: string
  tag: string
  name: string
  category: string
  departmentId: string
  department: string
  tracking: Tracking
  // How many are free over the dates asked about; null when no dates were given.
  available: number | null
}
