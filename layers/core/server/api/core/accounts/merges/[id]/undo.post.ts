// Undo a merge (ID-32): once it is complete and while its window lasts. Staff hold the merge
// ability over the survivor; the rows move back in the background and the accounts part at the end.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse, requireAbility } from '#kit'
import { undoMerge } from '../../../../../identity/merge-undo'

export default defineRoute({
  ability: 'core.account.merge',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const id = getRouterParam(event, 'id') ?? ''
  const merge = await first<{ survivor_id: string }>('SELECT survivor_id FROM core_account_merges WHERE id = ?', id)
  if (!merge) refuse('core.not-found', 'There is no such merge.', { status: 404 })
  await requireAbility(actor, 'core.account.merge', ['core.account', merge.survivor_id])
  await undoMerge(unit, actor, id)
  return { mergeId: id, undoing: true }
})
