// Chooses a performance's own wheelchair spaces, overriding its run's (Matt 2026-11-17, 21:58): a
// layout of its space, whose seats a performance sold as one part of the house takes too, or numbers
// typed in; or hands the performance back to its run's choice.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setPerformanceChoice, wheelchairChoice } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: wheelchairChoice,
}, async (_event, { input, record, unit }) => {
  await setPerformanceChoice(unit.view(), record!.id, input)
  return { ok: true }
})
