// Payments' own part: the test payment a treasurer makes from guided setup on a test-mode account
// (record payments.test-payment). It sells nothing and returns no entries; test money posts nothing.
import type { Settlement } from '../../points/settlement'

export default {
  settle: () => [],
  refunded: () => [],
} satisfies Settlement
