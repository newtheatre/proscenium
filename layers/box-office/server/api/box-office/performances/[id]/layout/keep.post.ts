// Undoes an early release (release.post.ts): the seats of the wheelchair spaces still unbooked are
// kept back again until the keep-back time.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { keepAgain } from '../../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await keepAgain(unit.view(), record!.id)
  return { ok: true }
})
