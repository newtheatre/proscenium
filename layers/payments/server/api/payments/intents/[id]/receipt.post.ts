// Sends the receipt for a till sale already paid, to someone who asks for it afterwards: the whole
// sale, or one person's share of a split sale. One receipt per sale or person; never sent twice.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { createUnit, defineRoute, refuse } from '#kit'
import { getIntent, partsOf, settlements } from '../../../../intents'
import { receiptTo, resolveReceipt } from '../../../../receipt-input'
import { paidByOf, rowsOf, sendReceipts } from '../../../../splits'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({
    receipt: receiptTo,
    split: z.number().int().positive().max(100).optional(), // not-policy: a person's number on the receipt
  }).strict(),
}, async (event, { input }) => {
  const intent = await getIntent(getRouterParam(event, 'id') ?? '')
  if (!intent || intent.channel !== 'desk') refuse('core.not-found', 'There is no such till sale.', { status: 404 })
  if (intent!.state !== 'succeeded') refuse('payments.intent.not-paid', 'This sale is not paid for.', { status: 409 })
  const rows = await rowsOf(intent!.id)
  const split = rows.some(r => r.position > 0)
  if (split && input.split === undefined) refuse('payments.till.which-person', 'Say which person the receipt is for.', { status: 422, fields: { split: 'payments.till.which-person' } })
  const row = rows.find(r => r.position === (split ? input.split : 0))
  if (!row) refuse('core.not-found', 'There is no receipt for that.', { status: 404 })
  if (row!.receipt_sent_at !== null) refuse('payments.till.receipt-sent', 'This receipt has been sent already.', { status: 409 })
  const to = (await resolveReceipt(input.receipt))!
  const unit = createUnit()
  const view = unit.view()
  view.add({ sql: 'UPDATE payments_till_splits SET receipt_account_id = ?, receipt_to = ? WHERE id = ? AND receipt_sent_at IS NULL', params: [to.accountId ?? null, to.email ?? null, row!.id] })
    .expect(1, { code: 'payments.till.receipt-sent', reason: 'This receipt has been sent already.' })
  const sent = await sendReceipts(view, intent!, await partsOf(intent!.id), [{ ...row!, receipt_account_id: to.accountId ?? null, receipt_to: to.email ?? null }], await settlements(), await paidByOf(intent!.id, [row!]))
  if (!sent) refuse('payments.till.receipt-failed', 'The receipt could not be sent.', { status: 500 })
  await unit.commit()
  return { sent: true }
})
