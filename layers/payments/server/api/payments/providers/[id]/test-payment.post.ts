// Guided setup's test payment on a test-mode account (PAY-01): a payment Payments owns, for a small
// amount, that sells nothing and posts nothing.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { createUnit, defineRoute, newId, nowMs, Refusal } from '#kit'
import { createIntent } from '../../../../intents'
import { providerAccount } from '../../../../providers'
import { startAttempt } from '../../../../start'

const TEST_AMOUNT = 100 // not-policy: a test payment's amount; test money is never real
const LIFETIME = 30 * 60_000 // not-policy: long enough to finish a test payment by hand

export default defineRoute({
  ability: 'payments.provider.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ method: z.enum(['card_online', 'card_reader']), readerId: z.string().optional() }).strict(),
}, async (event, { input }) => {
  const account = await providerAccount(getRouterParam(event, 'id') ?? '')
  if (!account) throw new Refusal('core.not-found', 'There is no such provider account.', { status: 404 })
  if (account.mode !== 'test') throw new Refusal('payments.provider.not-test-mode', 'A test payment is made on an account in test mode.', { status: 409 })
  const channel = input.method === 'card_reader' ? 'desk' : 'online'
  const unit = createUnit()
  const { intentId } = await createIntent(unit.view(), { parts: [{ owner: { module: 'payments', record: newId('pay') }, amountMinor: TEST_AMOUNT }], channel, expiresAt: nowMs() + LIFETIME })
  await unit.commit()
  return { intentId, ...await startAttempt(intentId, { providerAccountId: account.id, method: input.method, readerId: input.readerId }) }
})
