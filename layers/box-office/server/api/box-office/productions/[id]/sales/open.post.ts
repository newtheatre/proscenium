// Puts every performance of a production that is ready on sale at once (box office review S2), and
// says how many are not ready yet.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { openRun } from '../../../../../run-setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await getProduction(record!.id!)
  return openRun(unit.view(), record!.id!, actor)
})
