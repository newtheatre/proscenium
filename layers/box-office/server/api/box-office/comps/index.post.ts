// Ask for complimentary tickets (BO-62): how many, in which band, for whom and why. Needs
// `box-office.comp.request` on the performance.
import { defineRoute, requireAbility } from '#kit'
import { requestComps } from '../../../comps'
import { compsInput } from '../../../input'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: compsInput,
}, async (_event, { input, actor, unit }) => {
  await requireAbility(actor, 'box-office.comp.request', ['core.performance', input.performanceId])
  return requestComps(unit.view(), input)
})
