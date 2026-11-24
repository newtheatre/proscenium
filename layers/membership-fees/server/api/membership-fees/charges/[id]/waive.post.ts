// Waiving a fee (P9): the membership is marked paid, and activates if nothing else is outstanding;
// the charge is voided, with any payment still open for it cancelled. The reason is kept as the
// membership's note, for staff; the audit holds ids only.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { markPaid } from '#modules/membership'
import { voidCharge } from '../../../../charges'

export default defineRoute({
  ability: 'membership-fees.charge.waive',
  record: event => ['membership-fees.charge', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ note: z.string().trim().min(1).max(500) }).strict(), // not-policy: the bound of a staff note
}, async (_event, { input, record, unit }) => {
  const charge = await first<{ membership_id: string, state: string }>('SELECT membership_id, state FROM membership_fees_charges WHERE id = ?', record!.id)
  if (!charge) refuse('core.not-found', 'There is no such fee.', { status: 404 })
  if (charge!.state !== 'open') refuse('membership-fees.charge.not-open', 'This fee is not waiting to be paid.', { status: 409 })
  const result = await markPaid(unit.view(), charge!.membership_id, { note: input.note })
  await voidCharge(unit.view(), charge!.membership_id)
  unit.audit({ action: 'state', record: ['membership-fees.charge', record!.id], detail: { to: 'waived', membershipId: charge!.membership_id } })
  unit.audit({ action: 'update', record: ['membership.membership', charge!.membership_id], detail: { fee: 'waived', chargeId: record!.id } })
  return { membershipState: result.state }
})
