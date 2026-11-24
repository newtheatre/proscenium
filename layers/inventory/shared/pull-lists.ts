// A production's pull lists (INV-17, INV-18, S15): what starting one and matching a line take, and
// what the production's Kit tab answers.
import { z } from 'zod'
import type { LoanState } from './states'

const id = z.string().min(1).max(40) // not-policy: shape bound
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of YYYY-MM-DD

export const startPullListInput = z.object({
  productionId: id,
  departmentId: id,
  startsOn: localDate,
  dueBackOn: localDate.nullish().or(z.literal('')).transform(v => v || null),
}).strict()
export type StartPullListInput = z.infer<typeof startPullListInput>

export const matchInput = z.object({
  itemId: id,
  quantity: z.number().int().min(1).max(1_000_000).nullish(), // not-policy: shape bound
}).strict()

export interface KitList {
  id: string
  departmentId: string
  department: string
  state: LoanState
  dueBackOn: string
  dueBackAt: number
  wanted: number
  listed: number
  promised: number
  out: number
}

export interface ProductionKit {
  lists: KitList[]
  // Departments this person may start a pull list with now: none open yet for the production.
  startable: { id: string, name: string }[]
  canStart: boolean
  // When the lists would be due back by default (L9), and the theatre's today, for the start form.
  dueBackOn: string | null
  today: string
}

export interface Candidate { id: string, tag: string, name: string, tracking: 'individual' | 'counted', free: boolean }
