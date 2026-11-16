// The pretend provider. Tests say what it "knows" about each reference in `world`, and sign a
// webhook with `sign`.
import type { PaymentProvider, ProviderAnswer, RefundAnswer } from '#modules/payments'

export const world = { answers: new Map<string, ProviderAnswer | 'unknown'>(), statusCalls: 0, failStatus: false, refundAnswer: { state: 'succeeded' } as RefundAnswer, refundKeys: [] as string[] }
const KEY = 'cardco-test-key'

export function sign(eventId: string): string {
  return `${KEY}:${eventId}`
}

export default {
  capabilities: ['online-card', 'webhooks', 'refund'],
  methods: [{ method: 'card_online', channels: ['online'] }],
  secrets: [],
  async start(attempt) {
    return { next: { kind: 'none' }, providerRef: `cc_${attempt.id}` }
  },
  async status(attempt) {
    world.statusCalls++
    if (world.failStatus) throw new Error('cardco is down')
    return world.answers.get(attempt.providerRef ?? '') ?? 'unknown'
  },
  async refund(refund) {
    world.refundKeys.push(refund.idempotencyKey)
    return world.refundAnswer
  },
  async verifyWebhook({ body, headers }) {
    let event: { id?: string, type?: string, ref?: string }
    try {
      event = JSON.parse(body)
    }
    catch {
      return null
    }
    if (!event.id || !event.type) return null
    return { ok: headers['x-cardco-signature'] === sign(event.id), eventId: event.id, type: event.type, providerRef: event.ref }
  },
} satisfies PaymentProvider
