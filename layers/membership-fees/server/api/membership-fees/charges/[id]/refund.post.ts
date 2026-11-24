// Asking for a refund of a fee (P7). Payments' own rule decides whether a second person must approve
// it. When the money has gone back, the settlement handler reverses the income and, on a full refund,
// ends the membership where membership-fees.refunds.end-on-full-refund says so.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { intentStatus, requestRefund } from '#modules/payments'

export default defineRoute({
  ability: 'membership-fees.refund.request',
  record: event => ['membership-fees.charge', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ amountMinor: z.number().int().min(1) }).strict(),
}, async (_event, { input, actor, record, unit }) => {
  const charge = await first<{ state: string, intent_id: string | null, amount_minor: number, refunded_minor: number }>('SELECT state, intent_id, amount_minor, refunded_minor FROM membership_fees_charges WHERE id = ?', record!.id)
  if (!charge) refuse('core.not-found', 'There is no such fee.', { status: 404 })
  if (!['paid', 'part-refunded'].includes(charge!.state) || !charge!.intent_id) refuse('membership-fees.refund.not-paid', 'This fee has not been paid, so there is nothing to refund.', { status: 409 })
  if (input.amountMinor > charge!.amount_minor - charge!.refunded_minor) refuse('membership-fees.refund.too-much', 'That is more than is left to refund.', { status: 422, fields: { amountMinor: 'membership-fees.refund.too-much' } })
  const part = (await intentStatus(charge!.intent_id!))?.parts.find(p => p.owner.module === 'membership-fees' && p.owner.record === record!.id)
  if (!part) refuse('membership-fees.refund.not-paid', 'This fee has not been paid, so there is nothing to refund.', { status: 409 })
  const asked = await requestRefund(unit.view(), { partId: part!.id, amountMinor: input.amountMinor, requestedBy: actor.accountId ?? null })
  unit.audit({ action: 'state', record: ['membership-fees.charge', record!.id], detail: { to: 'refund-requested', refundId: asked.refundId, amountMinor: input.amountMinor } })
  return asked
})
