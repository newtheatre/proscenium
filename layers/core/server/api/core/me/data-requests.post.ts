// Ask for my account to be erased (ID-16). It needs a fresh re-assertion, and does nothing until the
// link emailed to my audience address is used.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh } from '../../../identity/guards'
import { requestErasure } from '../../../identity/data-requests'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ kind: z.literal('erasure') }).strict(),
}, async (event, { unit, actor }) => {
  await requireFresh(actor)
  return requestErasure(unit, event, actor, { accountId: actor.accountId! })
})
