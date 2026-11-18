// Gives the lines that differ a reason, while the count waits for approval.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setReasons, reasonsInput } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stocktake.approve',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: reasonsInput,
}, async (_event, { record, unit, input }) => {
  await setReasons(unit, record!.id, input)
  return { ok: true }
})
