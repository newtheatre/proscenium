// Loans as the screens and routes see them (S4, S5): the lending form's schema, shared so the form
// refuses what the server would, and what the loan routes answer.
import { z } from 'zod'
import type { LineState, LoanKind, LoanState } from './states'

const id = z.string().min(1).max(40) // not-policy: shape bound
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of YYYY-MM-DD
const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

// Lending straight from the department (INV-21): to a member by their account, or to an outside
// borrower by name and email; production loans start as pull lists (INV-17).
export const lendInput = z.object({
  departmentId: id,
  kind: z.enum(['member', 'outside']),
  borrowerAccountId: id.nullish().transform(v => v ?? null),
  borrowerName: text(120), // not-policy: as the table's CHECK
  borrowerEmail: z.string().trim().email().max(254).nullish().or(z.literal('')).transform(v => v || null), // not-policy: an address's longest
  purpose: text(500), // not-policy: as the table's CHECK
  startsOn: localDate,
  dueBackOn: localDate,
  itemIds: z.array(id).max(40).default([]), // not-policy: the spec's "a few to forty per loan"
}).strict()
  .refine(v => v.dueBackOn >= v.startsOn, { message: 'It cannot be due back before it goes out.', path: ['dueBackOn'] })
  .refine(v => v.kind === 'member' ? !!v.borrowerAccountId : !!v.borrowerName && !!v.borrowerEmail, { message: 'Say who is borrowing it.', path: ['borrowerName'] })
export type LendInput = z.infer<typeof lendInput>

export const lineInput = z.object({
  itemId: id.nullish().transform(v => v ?? null),
  wanted: text(200), // not-policy: as the table's CHECK
  quantity: z.number().int().min(1).max(1_000_000).default(1), // not-policy: shape bound
}).strict().refine(v => !!v.itemId || !!v.wanted, { message: 'Name an item, or say what is wanted.', path: ['wanted'] })

export const declineInput = z.object({ note: text(500) }).strict() // not-policy: as the table's CHECK

export interface LoanRow {
  id: string
  kind: LoanKind
  state: LoanState
  departmentId: string
  department: string
  borrower: string
  startsAt: number
  dueBackOn: string
  dueBackAt: number
  lines: number
}

export interface LoanLine {
  id: string
  itemId: string | null
  tag: string | null
  name: string | null
  wanted: string | null
  quantity: number
  state: LineState
  withLineId: string | null
  // Whether the item is free over the loan's window, asked as the promise would ask it; null once promised.
  free: { free: true } | { free: false, reason: 'not-usable' | 'taken' } | null
}

export interface LoanDetail extends LoanRow {
  productionId: string | null
  purpose: string | null
  borrowerEmail: string | null
  declineNote: string | null
  lineList: LoanLine[]
  can: { approve: boolean, edit: boolean, cancel: boolean }
}
