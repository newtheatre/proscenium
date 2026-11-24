// The practice card reader (Practice mode, part 4; PAY-10): a reader that exists only inside a
// practice store, standing in for the theatre's own. Starting a payment on it waits for the trainee,
// who answers on the practice card reader panel; that answer is the reader's (start-payment.ts).
import type { PaymentProvider } from '../../points/provider'

export default {
  capabilities: ['reader', 'refund', 'partial-refund'],
  methods: [{ method: 'card_reader', channels: ['desk'] }],
  secrets: [],
  practiceOnly: true,
  async start() {
    return { next: { kind: 'waiting-for-reader' } }
  },
  async status() {
    return 'unknown'
  },
  async refund() {
    return { state: 'succeeded' }
  },
  async cancel() {
    return true
  },
} satisfies PaymentProvider
