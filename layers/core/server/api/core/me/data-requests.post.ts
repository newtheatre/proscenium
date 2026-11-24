// Ask for my account to be erased (ID-16), or for a download of my data (ID-15). Both need a fresh
// re-assertion. An erasure does nothing until the link emailed to my audience address is used; a
// download is built by a job and announced by email when it is ready.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh } from '../../../identity/guards'
import { requestErasure } from '../../../identity/data-requests'
import { requestExport } from '../../../identity/export'

export default defineRoute({ practice: 'refuse',
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ kind: z.enum(['erasure', 'export']) }).strict(),
}, async (event, { input, unit, actor }) => {
  await requireFresh(actor)
  if (input.kind === 'export') return requestExport(unit, actor, actor.accountId!)
  return requestErasure(unit, event, actor, { accountId: actor.accountId! })
})
