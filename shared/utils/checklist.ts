import { z } from 'zod'

// The pre and post-show checklist's vocabulary (E-114). Nothing here reads a request or the
// database; `server/utils/checklist.ts` is where an item is stamped, ticked and exempted.

export const PHASES = ['PRE', 'POST'] as const
export type Phase = (typeof PHASES)[number]

export function saysPhase(phase: Phase): string {
  return phase === 'PRE' ? 'Pre-show' : 'Post-show'
}

// A live check the item ticks itself from; nothing here is ever hand-ticked (criterion 3).
export const SYSTEM_CHECKS = ['NO_SHOW_HOLDS_RELEASED', 'INCIDENTS_REVIEWED'] as const
export type SystemCheck = (typeof SYSTEM_CHECKS)[number]

// Exhaustive on purpose, matching `evaluate()`'s dispatch in `server/utils/checklist.ts`: a
// third check must touch both, and `never` refuses to compile until it does.
export function saysSystemCheck(check: SystemCheck): string {
  switch (check) {
    case 'NO_SHOW_HOLDS_RELEASED': return 'No-show holds released'
    case 'INCIDENTS_REVIEWED': return 'Tonight\'s incidents reviewed'
    default: return check satisfies never
  }
}

const LABEL_LIMIT = 200

export const checklistItemForm = z.object({
  venueId: z.string().min(1),
  phase: z.enum(PHASES),
  label: z.string().trim().min(1).max(LABEL_LIMIT),
  sort: z.number().int(),
  required: z.boolean(),
  systemCheck: z.enum(SYSTEM_CHECKS).nullish().transform(value => value ?? null),
})

export type ChecklistItemInput = z.output<typeof checklistItemForm>

const REASON_LIMIT = 500

export const exemptForm = z.object({
  reason: z.string().trim().min(1, 'Say why, because an exception needs a reason on the record').max(REASON_LIMIT),
})

export type ExemptInput = z.output<typeof exemptForm>
