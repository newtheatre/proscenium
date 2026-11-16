// Cash at the desk. No account anywhere: the seller records what was handed over.
import type { PaymentProvider } from '../../points/provider'

export default {
  capabilities: ['cash', 'attested', 'refund', 'partial-refund'],
  methods: [{ method: 'cash', channels: ['desk'] }],
  secrets: [],
} satisfies PaymentProvider
