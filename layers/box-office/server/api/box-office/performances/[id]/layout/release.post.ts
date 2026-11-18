// Lets the seats kept back for a performance's unbooked wheelchair spaces go on general sale now,
// before the keep-back time. Audited; undone with keep.post.ts while spaces are still unbooked.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { releaseKept } from '../../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await releaseKept(unit.view(), record!.id, actor.accountId ?? null)
  return { ok: true }
})
