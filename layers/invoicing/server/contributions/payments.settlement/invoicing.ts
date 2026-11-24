// Money for an invoice out: settled by allocating it (I-20 to I-23), given back by a reversal (I-25).
import type { Settlement } from '#modules/payments'
import { reversePart, settlePart } from '../../receipts'

export default {
  settle: settlePart,
  refunded: reversePart,
} satisfies Settlement
