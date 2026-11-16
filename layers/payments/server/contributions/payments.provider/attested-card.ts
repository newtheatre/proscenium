// A card payment taken on a standalone machine, recorded by the person who took it. Refunded only by
// a person recording that the machine refunded it.
import type { PaymentProvider } from '../../points/provider'

export default {
  capabilities: ['attested', 'refund', 'partial-refund'],
  methods: [{ method: 'card_attested', channels: ['desk'] }, { method: 'other_attested', channels: ['desk'] }],
  secrets: [],
} satisfies PaymentProvider
