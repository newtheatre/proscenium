// Staff use a pass for tickets its holder already has (Matt, 19 November), from the holders list or
// at the till: each becomes the pass's entry where it stands and is no longer to be paid for. A paid
// ticket that cost more than the pass still owes has the difference refunded, with the usual approval.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { coverWithPass } from '../../../../pass-covers'

export default defineRoute({
  ability: 'box-office.order.exchange',
  record: event => ['box-office.pass', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ lineIds: z.array(idSchema('orl')).min(1).max(50) }).strict(), // not-policy: more tickets than one person holds
}, async (_event, { input, unit, record, actor }) => coverWithPass(unit.view(), record!.id!, input.lineIds, actor.accountId ?? null, undefined, true))
