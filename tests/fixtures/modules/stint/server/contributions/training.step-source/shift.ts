// The fixture's step source: tests push shifts into `shifts`; only confirmed ones are reported.
import { z } from 'zod'
import type { StepSource } from '../../../../../../../layers/training/server/points/step-source'

export interface StintShift { id: string, accountId: string, role: string, on: string, confirmedBy: string | null }
export const shifts: StintShift[] = []

export default {
  label: 'stint.shift.label',
  params: z.object({ role: z.string().min(1) }).strict(),
  async describe(params) {
    return `Shift as ${String(params.role)}`
  },
  async occurrences(accountIds, params, since) {
    return shifts
      .filter(s => accountIds.includes(s.accountId) && s.role === params.role && s.on >= since && s.confirmedBy)
      .map(s => ({ accountId: s.accountId, occurrenceId: s.id, on: s.on, confirmedBy: s.confirmedBy! }))
  },
  event: 'stint.shift.confirmed',
} satisfies StepSource
