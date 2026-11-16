// The SumUp reader by hand-off to the SumUp app (SumUp's Payment Switch), for a merchant account
// with no API access, such as a students' union account that lends a society its reader (Matt,
// 16 November). The till opens the SumUp app with the amount, and the app sends the seller back to a
// signed address of ours with what it says happened. Nothing can ask SumUp afterwards, so the
// callback is a claim, as trustworthy as a seller recording the reader's result by hand: it is bound
// to an attempt a seller started, signed so that only the address made for that attempt is accepted,
// and SumUp's transaction code is kept so reconciliation can check it against SumUp's dashboard.
// Refunds are made in the SumUp app and confirmed here by a person, as for an attested card.
import { credential } from '#kit'
import { signing } from '#kit/signing'
import { minorDigits } from './sumup'
import type { PaymentProvider } from '../../points/provider'

const AFFILIATE_KEY = 'PAYMENTS_SUMUP_AFFILIATE_KEY'
const APP_ID = 'PAYMENTS_SUMUP_APP_ID'
export const HANDOFF_PURPOSE = 'payments.handoff'

/** What is signed for an attempt's return address. */
export const handoffData = (attemptId: string) => `payments.handoff:${attemptId}`

export default {
  capabilities: ['reader', 'attested'],
  methods: [{ method: 'card_reader', channels: ['desk'] }],
  secrets: [AFFILIATE_KEY, APP_ID],

  async start(attempt) {
    if (!attempt.origin) return { next: { kind: 'none' }, answer: { state: 'failed', failureCode: 'no-return-address' } }
    const [key, appId] = [await credential(AFFILIATE_KEY), await credential(APP_ID)]
    if (!key || !appId) throw new Error('The SumUp affiliate key or app id is not set')
    const { keyId, signature } = await signing.sign(HANDOFF_PURPOSE, handoffData(attempt.id))
    const back = `${attempt.origin}/api/payments/handoff/${attempt.id}/${keyId}.${signature}`
    const digits = minorDigits(attempt.currency)
    const params = new URLSearchParams({
      'affiliate-key': key,
      'app-id': appId,
      'total': (attempt.amountMinor / 10 ** digits).toFixed(digits), // not-policy: decimal places
      'currency': attempt.currency,
      'title': 'Till sale', // shown in SumUp's own history beside the transaction
      'foreign-tx-id': attempt.id,
      // Android reads callback; iOS reads callbacksuccess and callbackfail.
      'callback': back,
      'callbacksuccess': back,
      'callbackfail': back,
    })
    return { next: { kind: 'handoff', url: `sumupmerchant://pay/1.0?${params}` } }
  },
} satisfies PaymentProvider
