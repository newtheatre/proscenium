// Staff end a membership, with a note saying why (tab 4, "Ending"). An application's open charge is
// voided with it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { charger } from '../../../../charge'
import { endMembership } from '../../../../ending'

export default defineRoute({
  ability: 'membership.membership.end',
  record: event => ['membership.membership', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ note: z.string().trim().min(1).max(500) }), // not-policy: the bound of a staff note
}, async (_event, { input, actor, record, unit }) => {
  endMembership(unit, { id: record!.id, reason: 'by-staff', by: actor.accountId!, note: input.note })
  await (await charger())?.void(unit, record!.id)
  return { state: 'ended' }
})
