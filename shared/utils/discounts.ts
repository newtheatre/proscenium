import { z } from 'zod'

// Bar discounts: a percentage, capped by configuration, snapshotted onto each sale line it
// touches (F-117). `server/utils/discounts.ts` is where one is actually written and read.

export const DISCOUNT_STATUSES = ['ACTIVE', 'RETIRED'] as const
export type DiscountStatus = (typeof DISCOUNT_STATUSES)[number]

const NAME_LIMIT = 80

// The percentage cap itself is configuration (`BAR_DISCOUNT_MAX_PERCENT`), enforced at the write
// path rather than here: a settings change should not need a redeploy (0012).
export const discountForm = z.object({
  name: z.string().trim().min(1, 'A discount needs a name').max(NAME_LIMIT),
  // Refused, never rounded or clamped: -10 went live as 1% and 12.5 as 13% (0127).
  percent: z.number({ error: 'Type a whole number, such as 10' }).int('A discount is whole points, such as 12 or 13')
    .positive('A discount is a percentage above zero').max(100, 'A discount is at most 100%'),
})

export type DiscountInput = z.output<typeof discountForm>

export const discountStatusForm = z.object({ status: z.enum(DISCOUNT_STATUSES) })

export interface Discount {
  id: string
  name: string
  percent: number
  status: DiscountStatus
}

// Rounded down: a discount never gives more than its own percentage by accident, which is what
// criterion 1's "never free by accident" actually rests on once the arithmetic is real (F-117).
export function discountedPence(amountPence: number, percent: number): number {
  return Math.floor((amountPence * percent) / 100)
}
