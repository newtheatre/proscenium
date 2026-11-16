// Tick one line of a request's hand-search checklist (ID-35): a table searched by hand for rows
// about the person that name no account.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requestById, tick } from '../../../../identity/data-requests'

export default defineRoute({
  ability: 'core.data-request.manage',
  record: event => ['core.data-request', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ table: z.string().max(64), outcome: z.enum(['nothing-found', 'handled']) }).strict(), // not-policy: a table name is short
}, async (_event, { input, record, unit, actor }) => {
  await tick(unit, actor, (await requestById(record!.id))!, input.table, input.outcome)
  return { ok: true }
})
