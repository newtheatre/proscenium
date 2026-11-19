// Money taken some other way at the desk (a voucher, a bank transfer, an invoice), recorded by the
// person who took it with a note of what it was. Apart from any card machine (Matt, 19 November).
import type { PaymentProvider } from '../../points/provider'

export default {
  capabilities: ['attested', 'refund', 'partial-refund'],
  methods: [{ method: 'other_attested', channels: ['desk'] }],
  secrets: [],
} satisfies PaymentProvider
