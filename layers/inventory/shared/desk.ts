// The kit desk (S6; INV-22, INV-23): what a check-out and a return send, and what the desk reads
// about one loan, each line with what it needs of the person collecting.
import { z } from 'zod'
import { CONDITIONS, OVERRIDE_REASONS, type Condition, type LineState, type LoanKind, type LoanState, type Tracking } from './states'

const id = z.string().min(1).max(40) // not-policy: shape bound

export const checkOutInput = z.object({
  lines: z.array(z.object({ lineId: id, condition: z.enum(CONDITIONS) }).strict()).min(1).max(200), // not-policy: shape bound
  collectorAccountId: id.nullish().transform(v => v ?? null),
  overrideReason: z.enum(OVERRIDE_REASONS).nullish().transform(v => v ?? null),
}).strict()
export type CheckOutInput = z.infer<typeof checkOutInput>

export const returnInput = z.object({
  lines: z.array(z.object({
    lineId: id,
    condition: z.enum(CONDITIONS),
    quantity: z.number().int().min(1).max(1_000_000).nullish(), // not-policy: shape bound
    lost: z.boolean().default(false),
    fault: z.string().trim().max(2000).nullish().transform(v => v || null), // not-policy: as the fault's CHECK
  }).strict().refine(l => l.lost || l.condition !== 'damaged' || !!l.fault, { message: 'Say what is wrong with it.', path: ['fault'] })).min(1).max(200), // not-policy: shape bound
}).strict()
export type ReturnInput = z.infer<typeof returnInput>

export interface DeskNeed { ref: string, label: string, met: boolean, checked: boolean }

export interface DeskLine {
  id: string
  itemId: string
  tag: string
  name: string
  tracking: Tracking
  quantity: number
  returnedQuantity: number
  state: LineState
  condition: Condition
  withLineId: string | null
  needs: DeskNeed[]
}

export interface DeskLoan {
  id: string
  kind: LoanKind
  state: LoanState
  department: string
  borrower: string
  responsible: { id: string, name: string } | null
  startsAt: number
  dueBackOn: string
  // Check-out may begin on the operating day the loan starts (L11).
  startsLater: boolean
  canOverride: boolean
  lines: DeskLine[]
}
