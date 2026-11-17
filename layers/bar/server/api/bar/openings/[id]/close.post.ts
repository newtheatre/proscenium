// Closes an outlet's opening (BAR-10). Open sales are voided; a sale waiting for its payment refuses.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, requireAbility } from '#kit'
import { closeOpening, refuseUnknown } from '../../../../openings'

export default defineRoute({ ability: 'bar.opening.manage', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id')!
  const row = await first<{ outlet_id: string }>('SELECT outlet_id FROM bar_openings WHERE id = ?', id)
  if (!row) refuseUnknown()
  await requireAbility(actor, 'bar.opening.manage', ['bar.outlet', row!.outlet_id])
  closeOpening(unit, id, actor.accountId ?? null)
  unit.announce('bar.opening.closed', { openingId: id, outletId: row!.outlet_id }, { record: ['bar.opening', id] })
  return { ok: true }
})
