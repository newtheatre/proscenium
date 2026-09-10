import { z } from 'zod'
import type { TicketTypeAccessKind } from './ticket-types'

// Foregone comp and discount value, and access/companion admissions, read cross-module by show
// or by period (I-103): the same figures the night report derives per performance, widened.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD')

export const financeScopeForm = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('SHOW'), showId: z.string().trim().min(1) }),
  z.object({ scope: z.literal('PERIOD'), from: isoDate, to: isoDate }),
])

export type FinanceScopeInput = z.output<typeof financeScopeForm>

export interface ForegoneReport {
  compsPence: number
  compCount: number
  discountsPence: number
  discountCount: number
}

// Counts and value only, never a need or a name (criterion 3): nothing here joins a declaration.
export interface AccessAdmissionRow {
  accessKind: TicketTypeAccessKind
  count: number
  valuePence: number
}

export interface FinanceForegoneReport {
  foregone: ForegoneReport
  accessAdmissions: AccessAdmissionRow[]
}
