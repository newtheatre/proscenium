// Sets a run's wheelchair spaces on its Tickets tab (Matt 2026-11-17, 21:58): a layout, used at its
// performances in that layout's space, numbers typed in, used at all of them, or (inherit) each
// space's usual layout. A performance with its own choice keeps it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { setRunChoice, wheelchairChoice } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: wheelchairChoice,
}, async (_event, { input, record, unit }) => {
  await getProduction(record!.id!)
  await setRunChoice(unit.view(), record!.id!, input)
  return { ok: true }
})
